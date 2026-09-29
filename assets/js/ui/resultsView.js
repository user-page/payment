/**
 * Dựng HTML cho bảng kết quả.
 *
 * Dùng chung cho cả ba nơi: tab "Các buổi nhậu" của người đã đăng nhập, link
 * chia sẻ một buổi, và link chia sẻ tổng hợp. Nhờ dùng chung mà ba nơi không
 * bao giờ hiện số khác nhau.
 *
 * Các hàm ở đây chỉ TRẢ VỀ CHUỖI, không tự gắn vào trang và không gắn sự kiện —
 * phần tương tác do bên gọi tự lo.
 */
import { fmtNum, escapeHtml } from '../utils/format.js';
import {
  computeSummary,
  computeSettlement,
  distributeShares,
  remainingOf,
  unpaidSponsors,
  totalSpent,
  totalSponsored,
  personName,
} from '../domain/settlement.js';

/** Dải số liệu tổng quan trên đầu bảng. */
function statStrip(ev) {
  const spent = totalSpent(ev);
  const sponsored = totalSponsored(ev);
  const stats = [
    ['Tổng chi', fmtNum(spent)],
    ['Tài trợ', fmtNum(sponsored)],
    ['Còn phải chia', fmtNum(Math.max(0, spent - sponsored))],
    ['Số khoản', String(ev.rounds.length)],
    ['Số người', String(ev.people.length)],
  ];

  return `<div class="stat-strip">${stats
    .map(
      ([label, value]) =>
        `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`
    )
    .join('')}</div>`;
}

/**
 * Bảng chia tiền theo từng tăng.
 *
 * Mỗi NGƯỜI một dòng, mỗi TĂNG một cột — nhìn ngang là biết một người phải
 * trả bao nhiêu cho từng tăng, nhìn dọc là biết một tăng chia cho những ai.
 *
 * Ô "—" nghĩa là người đó không tích tham gia tăng ấy, nên không phải trả.
 *
 * Số trong ô là phần chia của tăng đó, chia đều cho những ai tham gia và làm
 * tròn xuống (xem distributeShares). Vì làm tròn xuống, cộng cột có thể hụt
 * vài nghìn so với dòng "Tổng chi" — đó là phần lẻ cố ý không thu của ai.
 */
function roundsTable(ev) {
  // Tính trước phần chia của từng tăng, tránh tính lại cho mỗi người.
  const shares = ev.rounds.map((r) => {
    const joined = (r.thamGiaIds || []).filter((id) => ev.people.some((p) => p.id === id));
    return distributeShares(r.soTien || 0, joined);
  });

  const head = ev.rounds
    .map((r, i) => {
      const payer = r.nguoiTraId ? personName(ev, r.nguoiTraId) : '— chưa chọn —';
      const place = [r.ngay, r.diaDiem].filter(Boolean).join(' · ');
      return `<th class="num">
        ${escapeHtml(r.ten || `Khoản ${i + 1}`)}
        <div class="round-sub">${escapeHtml(payer)} trả${place ? ` · ${escapeHtml(place)}` : ''}</div>
      </th>`;
    })
    .join('');

  const body = ev.people
    .map((p) => {
      let sum = 0;
      const cells = ev.rounds
        .map((r, i) => {
          const v = shares[i][p.id];
          if (v === undefined) return '<td class="num is-out">—</td>';
          sum += v;
          return `<td class="num">${fmtNum(v)}</td>`;
        })
        .join('');

      const tag = p.id === ev.organizerId ? ' <span class="organizer-tag">Chia tiền</span>' : '';
      return `<tr class="${p.id === ev.organizerId ? 'is-organizer' : ''}">
        <td><span class="name-cell">${escapeHtml(p.name)}${tag}</span></td>
        ${cells}
        <td class="num col-sum">${fmtNum(sum)}</td>
      </tr>`;
    })
    .join('');

  const perRound = ev.rounds.map((r) => `<td class="num">${fmtNum(r.soTien || 0)}</td>`).join('');
  const total = totalSpent(ev);
  const sponsored = totalSponsored(ev);

  // Chỉ nhắc tới tài trợ khi có, để bảng khỏi rối với buổi không ai bao.
  const sponsorNote = sponsored
    ? `<p class="table-note">Bảng này chưa trừ ${fmtNum(sponsored)} tiền tài trợ — phần trừ
       nằm ở bảng "Tổng kết từng người" bên dưới.</p>`
    : '';

  return `<div class="table-scroll"><table class="ledger rounds-breakdown">
    <thead><tr><th>Người</th>${head}<th class="num">Tổng</th></tr></thead>
    <tbody>
      ${body}
      <tr class="is-total">
        <td>Tổng chi</td>
        ${perRound}
        <td class="num">${fmtNum(total)}</td>
      </tr>
    </tbody>
  </table></div>${sponsorNote}`;
}

/** Bảng đã trả / phải trả / chênh lệch của từng người. */
function ledgerTable(ev, summary) {
  const rows = ev.people
    .map((p) => {
      const bal = summary.chenhLech[p.id];
      const cls = bal > 0 ? 'amount-pos' : bal < 0 ? 'amount-neg' : '';
      const text = (bal > 0 ? '+' : '') + fmtNum(bal);
      const tag = p.id === ev.organizerId ? ' <span class="organizer-tag">Chia tiền</span>' : '';
      return `<tr class="${p.id === ev.organizerId ? 'is-organizer' : ''}">
        <td><span class="name-cell">${escapeHtml(p.name)}${tag}</span></td>
        <td class="num">${fmtNum(summary.daTra[p.id])}</td>
        <td class="num">${fmtNum(summary.phaiTra[p.id])}</td>
        <td class="num ${cls}">${text}</td>
      </tr>`;
    })
    .join('');

  return `<div class="table-scroll"><table class="ledger">
    <thead><tr><th>Người</th><th class="num">Đã trả</th><th class="num">Phải trả</th><th class="num">Chênh lệch</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/**
 * Cảnh báo về tiền tài trợ đã hứa mà chưa đưa.
 *
 * Nhóm "người ngoài" quan trọng hơn hẳn: không có dòng nào trong bảng chuyển
 * khoản để đòi họ, nên người đứng ra chia tiền đang bị hụt mà không hay.
 */
export function unpaidSponsorNote(ev) {
  const { linked, outside, outsideTotal } = unpaidSponsors(ev);
  let html = '';

  if (linked.length) {
    const names = linked.map((sp) => `${escapeHtml(sp.ten)} (${fmtNum(sp.soTien)})`).join(', ');
    html += `<div class="sponsor-debt-note">Tiền tài trợ chưa đưa, đã cộng vào phần phải trả bên dưới: ${names}</div>`;
  }

  if (outside.length) {
    const names = outside.map((sp) => escapeHtml(sp.ten)).join(', ');
    html += `<div class="sponsor-debt-note is-warning">Còn thiếu ${fmtNum(outsideTotal)} tiền tài trợ chưa nhận từ ${names} — chưa cộng vào bảng dưới vì họ không có trong danh sách người tham gia.</div>`;
  }

  return html;
}

/**
 * Cảnh báo khoản chi chưa chọn ai trả.
 *
 * Tiền của khoản đó vẫn được chia cho người tham gia, nhưng không được cộng
 * vào cột "đã trả" của ai — nên bảng nhìn như thiếu tiền. Nói thẳng ra thay
 * vì để người dùng tự đoán.
 */
export function noPayerNote(ev) {
  const orphans = (ev.rounds || []).filter(
    (r) => (r.soTien || 0) > 0 && !ev.people.some((p) => p.id === r.nguoiTraId)
  );
  if (!orphans.length) return '';

  const names = orphans.map((r) => `${escapeHtml(r.ten || 'khoản chưa đặt tên')} (${fmtNum(r.soTien)})`).join(', ');
  return `<div class="sponsor-debt-note is-warning">Chưa chọn ai trả cho: ${names} — số tiền này chưa được tính là ai đã trả, nên cột "đã trả" đang thiếu. Chọn "Người trả" ở tab Chỉnh sửa.</div>`;
}

/**
 * Danh sách chuyển khoản.
 * @param {boolean} interactive true thì hiện ô nhập tiền đã trả và nút bấm được
 */
function settlementList(ev, settlement, interactive) {
  if (!settlement.length) {
    return '<div class="settlement-empty">Mọi người đã đóng đúng phần của mình — không cần chuyển khoản thêm.</div>';
  }

  const rows = settlement
    .map((s) => {
      // Luôn theo dõi trạng thái trả tiền trên người KHÔNG phải chủ xị,
      // bất kể tiền chảy chiều nào.
      const statusPersonId = s.fromId === ev.organizerId ? s.toId : s.fromId;
      const person = ev.people.find((p) => p.id === statusPersonId);
      const paidAmount = Math.max(0, Number(person?.paidAmount) || 0);
      const remaining = remainingOf(s.amount, paidAmount);
      const paid = remaining <= 0;

      const who = `<span class="who">${escapeHtml(personName(ev, s.fromId))} <span class="arrow">&rarr;</span> ${escapeHtml(personName(ev, s.toId))}</span>`;
      const amount = `<span class="amount">${fmtNum(s.amount)}</span>`;

      if (!interactive) {
        const label = paid ? 'Đã trả' : paidAmount > 0 ? `Còn ${fmtNum(remaining)}` : 'Chưa trả';
        return `<div class="settlement-row">${who}${amount}<span class="paid-toggle${paid ? ' is-paid' : ''}" style="cursor:default;">${label}</span></div>`;
      }

      return `<div class="settlement-row">
        ${who}${amount}
        <span class="paid-amount-wrap">
          <input type="text" inputmode="numeric" class="paid-amount-input money-input"
                 id="paid-input-${statusPersonId}"
                 data-person-id="${statusPersonId}" data-amount="${s.amount}"
                 value="${paidAmount || ''}" placeholder="Đã trả bao nhiêu"
                 title="Nhập số tiền đã trả (nghìn đồng) để tự trừ" />
          <span class="remaining-label${remaining > 0 ? ' is-owing' : ''}">${remaining > 0 ? `Còn: ${fmtNum(remaining)}` : 'Đủ rồi'}</span>
        </span>
        <button type="button" class="paid-toggle${paid ? ' is-paid' : ''}"
                data-person-id="${statusPersonId}" data-amount="${s.amount}">${paid ? 'Đã trả' : 'Chưa trả'}</button>
      </div>`;
    })
    .join('');

  return `<div class="settlement-list">${rows}</div>`;
}

/**
 * Toàn bộ phần kết quả của một buổi nhậu.
 *
 * @param {object} ev
 * @param {object} [opts]
 * @param {boolean} [opts.interactive=false] cho phép sửa trạng thái trả tiền
 * @param {string}  [opts.extraHtml=''] chèn thêm vào mục chuyển khoản (VD: ảnh QR)
 */
export function eventResultsHtml(ev, { interactive = false, extraHtml = '', withStats = true } = {}) {
  if (!ev.people?.length || !ev.rounds?.length) {
    return '<div class="empty-state">Buổi này chưa có đủ dữ liệu để hiển thị.</div>';
  }
  if (!ev.organizerId) {
    return '<div class="empty-state">Buổi này chưa chọn người đứng ra chia tiền.</div>';
  }

  const summary = computeSummary(ev);
  const settlement = computeSettlement(ev, summary);

  return `<section class="results-section">
    ${withStats ? statStrip(ev) : ''}
    ${noPayerNote(ev)}

    <h2 style="margin-top:0;">Từng khoản đã chi</h2>
    ${roundsTable(ev)}

    <h2>Tổng kết từng người</h2>
    ${ledgerTable(ev, summary)}
    <div class="settlement-section">
      <h2 style="margin-top:0;">Cần chuyển khoản</h2>
      ${unpaidSponsorNote(ev)}
      ${extraHtml}
      ${settlementList(ev, settlement, interactive)}
    </div>
  </section>`;
}

/** Bảng tổng nợ theo người, gộp qua nhiều buổi. */
export function debtTableHtml(rows) {
  if (!rows.length) {
    return '<div class="empty-state">Không ai còn nợ chưa trả.</div>';
  }

  const body = rows
    .map(
      (r) =>
        `<tr><td class="debt-name">${escapeHtml(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${r.count}</td></tr>`
    )
    .join('');

  return `<div class="table-scroll"><table class="ledger">
    <thead><tr><th>Người</th><th class="num">Tổng còn nợ (nghìn đ)</th><th class="num">Số buổi chưa trả</th></tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}
