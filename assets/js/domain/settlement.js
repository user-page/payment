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
 * Tính cho từng người: đã trả bao nhiêu, phải trả bao nhiêu, chênh lệch.
 *
 * Thứ tự các bước rất quan trọng, đổi thứ tự là sai tiền:
 *   1. Cộng tiền mỗi người đã đứng ra trả cho từng khoản chi
 *   2. Chia đều từng khoản chi cho những người tham gia khoản đó
 *   3. Trừ đều tổng tiền tài trợ vào phần phải trả của MỌI người
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

  // 1 + 2
  for (const r of ev.rounds) {
    if (r.nguoiTraId && Object.hasOwn(daTra, r.nguoiTraId)) {
      daTra[r.nguoiTraId] += r.soTien || 0;
    }
    const joined = (r.thamGiaIds || []).filter((id) => Object.hasOwn(phaiTra, id));
    const shares = distributeShares(r.soTien || 0, joined);
    for (const id of Object.keys(shares)) phaiTra[id] += shares[id];
  }

  const sponsors = ev.sponsors || [];
  const totalSponsor = sponsors.reduce((sum, sp) => sum + (sp.soTien || 0), 0);

  // 3
  if (totalSponsor > 0 && ev.people.length) {
    const allIds = ev.people.map((p) => p.id);
    const discount = distributeShares(totalSponsor, allIds);
    for (const id of Object.keys(discount)) phaiTra[id] -= discount[id];
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
