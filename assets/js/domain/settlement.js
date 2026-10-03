/**
 * Toàn bộ phép tính tiền của app.
 *
 * Tầng này THUẦN TÍNH TOÁN: không đụng DOM, không gọi mạng, không đọc state
 * toàn cục. Vào là dữ liệu, ra là kết quả — nhờ vậy test được bằng Node
 * (xem tests/settlement.test.mjs) mà không cần trình duyệt hay database.
 *
 * Đơn vị tiền xuyên suốt: NGHÌN ĐỒNG, số nguyên.
 */

/**
 * Chia đều `total` cho danh sách `ids`.
 *
 * Mọi người trả ĐÚNG BẰNG NHAU (làm tròn xuống). Phần lẻ còn thừa
 * (< số người, tức vài nghìn đồng) không thu của ai — thà thiếu vài nghìn
 * còn hơn để một người phải trả nhiều hơn người khác.
 *
 * VD: 800 chia 3 người -> mỗi người 266 (thừa 2, bỏ qua).
 */
export function distributeShares(total, ids) {
  const shares = {};
  const n = ids.length;
  if (n === 0) return shares;
  const base = Math.floor(total / n);
  for (const id of ids) shares[id] = base;
  return shares;
}

/**
 * Lọc ra các cặp "ai mời ai" dùng được của MỘT khoản chi.
 *
 * `r.ganhHo` có dạng { id người được mời: id người mời }. Hàm này là nơi DUY
 * NHẤT định nghĩa thế nào là một cặp hợp lệ, để tầng dữ liệu (lúc dọn dẹp) và
 * tầng tính tiền không bao giờ hiểu khác nhau.
 *
 * Bỏ cặp khi:
 *   - một trong hai người đã rời buổi
 *   - người được mời không tham gia khoản này (không có phần nào để gánh)
 *   - tự mời chính mình
 *   - NGƯỜI MỜI lại đang được người khác mời
 *
 * Luật cuối chặn dây chuyền (A mời B, B mời C) và vòng lặp (A mời B, B mời A).
 * Chỉ cho một tầng: đời thật không ai mời dây chuyền, mà bỏ luật này thì phải
 * viết thuật toán dò vòng và quyết định thứ tự áp dụng — nhiều chỗ sai hơn
 * hẳn so với thứ nó giải quyết được.
 *
 * Nhờ chỉ còn một tầng, thứ tự áp dụng các cặp không ảnh hưởng kết quả.
 *
 * NGƯỜI MỜI không bắt buộc phải tham gia khoản đó: có người không dự tăng ấy
 * nhưng vẫn nhận trả hộ phần của bạn mình.
 *
 * @param {object} r         khoản chi
 * @param {Set<string>} ids  id những người còn trong buổi
 */
export function ganhHoHopLe(r, ids) {
  const joined = new Set((r.thamGiaIds || []).filter((id) => ids.has(id)));
  const raw = {};
  for (const [duocMoi, nguoiMoi] of Object.entries(r.ganhHo || {})) {
    if (!ids.has(duocMoi) || !ids.has(nguoiMoi)) continue;
    if (duocMoi === nguoiMoi) continue;
    if (!joined.has(duocMoi)) continue;
    raw[duocMoi] = nguoiMoi;
  }

  const out = {};
  for (const [duocMoi, nguoiMoi] of Object.entries(raw)) {
    if (Object.hasOwn(raw, nguoiMoi)) continue; // người mời lại đang được mời
    out[duocMoi] = nguoiMoi;
  }
  return out;
}

/**
 * Phần phải trả của từng người cho MỘT khoản chi, đã tính chuyện mời nhau.
 *
 * Chia đều trước, DỜI phần của người được mời sang người mời sau — chứ không
 * nhân trọng số rồi chia lại. Hai cách nghe như nhau nhưng khác ở làm tròn:
 * distributeShares làm tròn xuống và bỏ phần lẻ, nên chia lại theo trọng số
 * sẽ cho ra tổng khác với chia đều. Dời phần sau khi chia thì tổng của khoản
 * KHÔNG đổi, dù có bao nhiêu cặp mời đi nữa.
 *
 * Người được mời còn lại 0 (khác hẳn `undefined` = không tham gia khoản này).
 *
 * @returns {Object} { id người: số tiền } — chỉ có key của người tham gia,
 *   cộng thêm người mời dù họ không tham gia.
 */
export function roundShares(ev, r) {
  const ids = new Set(ev.people.map((p) => p.id));
  const joined = (r.thamGiaIds || []).filter((id) => ids.has(id));
  const shares = distributeShares(r.soTien || 0, joined);

  for (const [duocMoi, nguoiMoi] of Object.entries(ganhHoHopLe(r, ids))) {
    shares[nguoiMoi] = (shares[nguoiMoi] || 0) + shares[duocMoi];
    shares[duocMoi] = 0;
  }
  return shares;
}

/**
 * Chuyển phần giảm trừ tài trợ của người được mời sang người đã mời họ.
 *
 * Vì sao cần: tài trợ được trừ đều cho MỌI người trong buổi. Người được mời
 * không phải trả gì, nên phần giảm trừ của họ sẽ đẩy "phải trả" xuống ÂM —
 * app sẽ bảo người được mời còn được nhận lại tiền, trong khi người thực sự
 * móc ví là người mời lại không được giảm đồng nào.
 *
 * Chuyển THEO TỈ LỆ phần bị gánh, chứ không phải chuyển hết:
 *
 *   B đi 2 tăng, tăng 1 được A mời, tăng 2 tự trả
 *   -> một nửa hoá đơn của B do A trả -> một nửa phần giảm trừ của B sang A
 *
 * Mời hết thì tỉ lệ bằng 1, chuyển trọn. Không ai mời thì tỉ lệ bằng 0, không
 * có gì đổi — buổi không có chuyện mời nhau tính y như trước.
 *
 * Làm tròn chỉ dịch tiền giữa người này với người kia, không bao giờ làm tổng
 * thay đổi: người mời cộng đúng bằng số người được mời bị trừ.
 */
function donGiamTruVeNguoiMoi(discount, goc, biGanh, phaiTra) {
  for (const id of Object.keys(biGanh)) {
    const nguoiMoi = Object.keys(biGanh[id]);
    if (!nguoiMoi.length || !goc[id]) continue;

    const tongBiGanh = nguoiMoi.reduce((n, who) => n + biGanh[id][who], 0);
    const chuyen = Math.round((discount[id] || 0) * Math.min(1, tongBiGanh / goc[id]));
    if (!chuyen) continue;

    phaiTra[id] += chuyen; // bớt phần giảm trừ của người được mời
    let conLai = chuyen;
    nguoiMoi.forEach((who, i) => {
      // Người cuối nhận hết phần còn lại, để tổng khớp tuyệt đối sau làm tròn.
      const phan = i === nguoiMoi.length - 1
        ? conLai
        : Math.round(chuyen * (biGanh[id][who] / tongBiGanh));
      conLai -= phan;
      if (Object.hasOwn(phaiTra, who)) phaiTra[who] -= phan;
    });
  }
}

/**
 * Tính cho từng người: đã trả bao nhiêu, phải trả bao nhiêu, chênh lệch.
 *
 * Thứ tự các bước rất quan trọng, đổi thứ tự là sai tiền:
 *   1. Cộng tiền mỗi người đã đứng ra trả cho từng khoản chi
 *   2. Chia đều từng khoản chi cho những người tham gia khoản đó, rồi dời
 *      phần của người được mời sang người mời (xem roundShares)
 *   3. Trừ đều tổng tiền tài trợ vào phần phải trả của MỌI người, rồi dồn
 *      phần giảm trừ của người được mời sang người mời — không dồn thì người
 *      được mời ra số âm, như thể họ được nhận lại tiền
 *   4. Người tài trợ bỏ tích "vẫn chia phần" -> miễn hẳn phần nhậu của họ
 *   5. Tài trợ đã hứa mà CHƯA đưa tiền -> cộng ngược khoản đó vào phần họ
 *      phải trả. Phải làm sau bước 4, nếu không khoản nợ này bị xoá mất.
 *
 * @returns {{daTra:Object, phaiTra:Object, chenhLech:Object, totalSponsor:number}}
 */
export function computeSummary(ev) {
  const daTra = {};
  const phaiTra = {};
  for (const p of ev.people) {
    daTra[p.id] = 0;
    phaiTra[p.id] = 0;
  }

  /*
   * Theo dõi mỗi người bị gánh mất bao nhiêu, và ai gánh — để bước 3 biết dồn
   * phần giảm trừ tài trợ về đâu.
   *   goc[B]       tổng phần của B trước khi bị gánh
   *   biGanh[B]    { id người mời: số tiền họ đã gánh cho B }
   */
  const goc = {};
  const biGanh = {};
  for (const p of ev.people) {
    goc[p.id] = 0;
    biGanh[p.id] = {};
  }

  // 1 + 2
  for (const r of ev.rounds) {
    if (r.nguoiTraId && Object.hasOwn(daTra, r.nguoiTraId)) {
      daTra[r.nguoiTraId] += r.soTien || 0;
    }

    const ids = new Set(ev.people.map((p) => p.id));
    const joined = (r.thamGiaIds || []).filter((id) => ids.has(id));
    const truocKhiMoi = distributeShares(r.soTien || 0, joined);
    for (const id of joined) goc[id] += truocKhiMoi[id];
    for (const [duocMoi, nguoiMoi] of Object.entries(ganhHoHopLe(r, ids))) {
      biGanh[duocMoi][nguoiMoi] = (biGanh[duocMoi][nguoiMoi] || 0) + truocKhiMoi[duocMoi];
    }

    const shares = roundShares(ev, r);
    for (const id of Object.keys(shares)) {
      if (Object.hasOwn(phaiTra, id)) phaiTra[id] += shares[id];
    }
  }

  const sponsors = ev.sponsors || [];
  const totalSponsor = sponsors.reduce((sum, sp) => sum + (sp.soTien || 0), 0);

  // 3
  if (totalSponsor > 0 && ev.people.length) {
    const allIds = ev.people.map((p) => p.id);
    const discount = distributeShares(totalSponsor, allIds);
    for (const id of Object.keys(discount)) phaiTra[id] -= discount[id];
    donGiamTruVeNguoiMoi(discount, goc, biGanh, phaiTra);
  }

  // 4
  for (const sp of sponsors) {
    if (sp.personId && sp.stillSplit === false && Object.hasOwn(phaiTra, sp.personId)) {
      phaiTra[sp.personId] = 0;
    }
  }

  // 5
  for (const sp of sponsors) {
    if (sp.personId && !sp.isPaid && Object.hasOwn(phaiTra, sp.personId)) {
      phaiTra[sp.personId] += sp.soTien || 0;
    }
  }

  const chenhLech = {};
  for (const p of ev.people) chenhLech[p.id] = daTra[p.id] - phaiTra[p.id];

  return { daTra, phaiTra, chenhLech, totalSponsor };
}

/**
 * Quy mọi khoản nợ về một đầu mối là người đứng ra chia tiền, để không ai
 * phải chuyển khoản lắt nhắt cho nhiều người.
 *
 * @returns {Array<{fromId:string, toId:string, amount:number}>} sắp xếp giảm dần
 */
export function computeSettlement(ev, summary) {
  const list = [];
  if (!ev.organizerId) return list;

  for (const p of ev.people) {
    if (p.id === ev.organizerId) continue;
    const bal = summary.chenhLech[p.id] || 0;
    if (bal < 0) list.push({ fromId: p.id, toId: ev.organizerId, amount: -bal });
    else if (bal > 0) list.push({ fromId: ev.organizerId, toId: p.id, amount: bal });
  }

  list.sort((a, b) => b.amount - a.amount);
  return list;
}

/**
 * Số tiền một người còn nợ sau khi trừ phần họ đã trả bớt.
 */
export function remainingOf(amount, paidAmount) {
  return Math.max(0, amount - Math.max(0, Number(paidAmount) || 0));
}

/**
 * Cộng dồn nợ của từng người qua NHIỀU buổi nhậu, gộp theo tên.
 *
 * Chỉ tính khoản người khác nợ người đứng ra chia tiền (không tính chiều
 * ngược lại), và đã trừ sẵn phần họ trả góp.
 *
 * @returns {Array<{name:string, total:number, count:number}>} sắp xếp giảm dần
 */
export function aggregateUnpaidDebts(events) {
  const debts = new Map();

  for (const ev of events || []) {
    if (!ev || !ev.organizerId) continue;
    const summary = computeSummary(ev);
    const settlement = computeSettlement(ev, summary);

    for (const s of settlement) {
      if (s.toId !== ev.organizerId) continue;
      const person = ev.people.find((p) => p.id === s.fromId);
      if (!person) continue;

      const remaining = remainingOf(s.amount, person.paidAmount);
      if (remaining <= 0) continue;

      const name = person.name.trim();
      const key = name.toLowerCase();
      const row = debts.get(key) || { name, total: 0, count: 0 };
      row.total += remaining;
      row.count += 1;
      debts.set(key, row);
    }
  }

  return [...debts.values()].sort((a, b) => b.total - a.total);
}

/**
 * Các khoản tài trợ đã hứa nhưng chưa đưa tiền, tách làm hai nhóm vì cách
 * xử lý khác hẳn nhau:
 *   - linked  : người tài trợ có trong danh sách tham gia -> đã cộng vào
 *               phần họ phải trả, sẽ đòi được qua bảng chuyển khoản
 *   - outside : người ngoài -> KHÔNG có dòng nào trong bảng để đòi, nên
 *               người đứng ra chia tiền đang bị hụt đúng số này
 */
export function unpaidSponsors(ev) {
  const unpaid = (ev.sponsors || []).filter((sp) => !sp.isPaid && (sp.soTien || 0) > 0);
  const linked = unpaid.filter((sp) => sp.personId);
  const outside = unpaid.filter((sp) => !sp.personId);
  return {
    linked,
    outside,
    outsideTotal: outside.reduce((sum, sp) => sum + (sp.soTien || 0), 0),
  };
}

/** Tổng tiền đã chi của một buổi. */
export function totalSpent(ev) {
  return (ev.rounds || []).reduce((sum, r) => sum + (r.soTien || 0), 0);
}

/** Tổng tiền tài trợ của một buổi. */
export function totalSponsored(ev) {
  return (ev.sponsors || []).reduce((sum, sp) => sum + (sp.soTien || 0), 0);
}

/** Tên người theo id, trả về '?' nếu không tìm thấy. */
export function personName(ev, id) {
  const p = ev.people.find((x) => x.id === id);
  return p ? p.name : '?';
}
