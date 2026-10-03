/**
 * Test cho phần tính tiền. Chạy: node --test tests/
 *
 * Không cần trình duyệt, không cần database — vì domain/settlement.js
 * là code thuần tính toán.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  distributeShares,
  computeSummary,
  computeSettlement,
  aggregateUnpaidDebts,
  remainingOf,
  unpaidSponsors,
  ganhHoHopLe,
} from '../assets/js/domain/settlement.js';

// ---- tiện ích dựng dữ liệu mẫu ----

function makeEvent({ people, rounds = [], sponsors = [], organizerId }) {
  return {
    id: 'ev1',
    name: 'Buổi test',
    organizerId,
    people: people.map((p) => ({ isPaid: false, paidAmount: 0, ...p })),
    rounds: rounds.map((r) => ({ soTien: 0, thamGiaIds: [], nguoiTraId: null, ...r })),
    sponsors: sponsors.map((s) => ({ soTien: 0, stillSplit: true, isPaid: false, personId: null, ...s })),
  };
}

const BA_NGUOI = [
  { id: 'a', name: 'ThangLV11' },
  { id: 'b', name: 'HungNN14' },
  { id: 'c', name: 'PhongTH4' },
];

// ---- distributeShares ----

test('chia đều: mọi người trả đúng bằng nhau, phần lẻ bỏ qua', () => {
  const shares = distributeShares(800, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 266, b: 266, c: 266 });

  const tong = Object.values(shares).reduce((s, v) => s + v, 0);
  assert.equal(tong, 798, 'thừa 2 nghìn không thu của ai');
});

test('chia đều: chia hết thì không thừa', () => {
  assert.deepEqual(distributeShares(900, ['a', 'b', 'c']), { a: 300, b: 300, c: 300 });
});

test('chia đều: không có ai thì trả về rỗng, không chia cho 0', () => {
  assert.deepEqual(distributeShares(500, []), {});
});

// ---- computeSummary: trường hợp cơ bản ----

test('một khoản chi, một người trả, ba người tham gia', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
  });

  const s = computeSummary(ev);
  assert.deepEqual(s.daTra, { a: 900, b: 0, c: 0 });
  assert.deepEqual(s.phaiTra, { a: 300, b: 300, c: 300 });
  assert.deepEqual(s.chenhLech, { a: 600, b: -300, c: -300 });

  const st = computeSettlement(ev, s);
  assert.deepEqual(st, [
    { fromId: 'b', toId: 'a', amount: 300 },
    { fromId: 'c', toId: 'a', amount: 300 },
  ]);
});

test('người không tham gia khoản nào thì không phải trả khoản đó', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [
      { id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] },
      { id: 'r2', soTien: 200, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }, // c về sớm
    ],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.c, 300, 'c chỉ chịu khoản đầu');
  assert.equal(s.phaiTra.b, 400, 'b chịu cả hai khoản');
});

// ---- tài trợ ----

test('tài trợ trừ đều vào phần mọi người phải trả', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'Sếp', soTien: 300, isPaid: true }],
  });

  const s = computeSummary(ev);
  assert.deepEqual(s.phaiTra, { a: 200, b: 200, c: 200 }, 'mỗi người được giảm 100');
});

test('người tài trợ cũng tham gia, bỏ tích chia phần -> miễn hẳn phần nhậu', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'HungNN14', soTien: 300, personId: 'b', stillSplit: false, isPaid: true }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.b, 0, 'b được miễn vì đã bao');
  assert.equal(s.phaiTra.c, 200, 'người khác vẫn được giảm đều');
});

test('ĐÚNG VÍ DỤ CỦA NGƯỜI DÙNG: tài trợ 800 chưa đưa tiền, bỏ tích chia phần -> vẫn nợ 800', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: false, isPaid: false }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.x, 800, 'miễn phần nhậu nhưng vẫn nợ đúng khoản tài trợ đã hứa');

  const st = computeSettlement(ev, s);
  const cuaX = st.find((r) => r.fromId === 'x');
  assert.deepEqual(cuaX, { fromId: 'x', toId: 'org', amount: 800 });
});

test('tài trợ chưa đưa tiền nhưng VẪN tích chia phần -> nợ cả hai phần', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: true, isPaid: false }],
  });

  const s = computeSummary(ev);
  assert.equal(s.phaiTra.x, 550 + 800, 'phần nhậu 550 cộng khoản tài trợ 800');
});

test('tài trợ đã đưa tiền rồi thì không nợ gì thêm', () => {
  const ev = makeEvent({
    organizerId: 'org',
    people: [
      { id: 'org', name: 'Organizer' },
      { id: 'x', name: 'X' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    rounds: [{ id: 'r1', soTien: 3000, nguoiTraId: 'org', thamGiaIds: ['org', 'x', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'X', soTien: 800, personId: 'x', stillSplit: false, isPaid: true }],
  });

  assert.equal(computeSummary(ev).phaiTra.x, 0);
});

// ---- trả góp ----

test('trả bớt một phần thì trừ đúng phần đã trả', () => {
  assert.equal(remainingOf(800, 300), 500);
  assert.equal(remainingOf(800, 0), 800);
  assert.equal(remainingOf(800, 800), 0);
  assert.equal(remainingOf(800, 900), 0, 'trả dư không thành số âm');
  assert.equal(remainingOf(800, null), 800, 'chưa nhập gì coi như chưa trả');
});

// ---- cộng dồn nợ nhiều buổi ----

test('cộng dồn nợ theo tên qua nhiều buổi, đã trừ phần trả góp', () => {
  const buoi1 = makeEvent({
    organizerId: 'a',
    people: [
      { id: 'a', name: 'ThangLV11' },
      { id: 'b', name: 'HungNN14' },
    ],
    rounds: [{ id: 'r1', soTien: 400, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }],
  });

  const buoi2 = makeEvent({
    organizerId: 'a2',
    people: [
      { id: 'a2', name: 'ThangLV11' },
      { id: 'b2', name: 'HungNN14', paidAmount: 50 }, // đã trả bớt 50
    ],
    rounds: [{ id: 'r2', soTien: 600, nguoiTraId: 'a2', thamGiaIds: ['a2', 'b2'] }],
  });

  const rows = aggregateUnpaidDebts([buoi1, buoi2]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'HungNN14');
  assert.equal(rows[0].total, 200 + (300 - 50));
  assert.equal(rows[0].count, 2);
});

test('trả đủ rồi thì không còn trong danh sách nợ', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: [
      { id: 'a', name: 'ThangLV11' },
      { id: 'b', name: 'HungNN14', paidAmount: 200 },
    ],
    rounds: [{ id: 'r1', soTien: 400, nguoiTraId: 'a', thamGiaIds: ['a', 'b'] }],
  });

  assert.deepEqual(aggregateUnpaidDebts([ev]), []);
});

test('buổi chưa chọn người chia tiền thì bỏ qua, không làm vỡ phép tính', () => {
  const ev = makeEvent({
    organizerId: null,
    people: BA_NGUOI,
    rounds: [{ id: 'r1', soTien: 900, thamGiaIds: ['a', 'b', 'c'] }],
  });

  assert.deepEqual(computeSettlement(ev, computeSummary(ev)), []);
  assert.deepEqual(aggregateUnpaidDebts([ev]), []);
});

// ---- cảnh báo tài trợ chưa đưa tiền ----

test('tách tài trợ chưa đưa thành nhóm có và không có trong danh sách', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    sponsors: [
      { id: 's1', ten: 'HungNN14', soTien: 800, personId: 'b', isPaid: false },
      { id: 's2', ten: 'Anh Tuấn', soTien: 300, personId: null, isPaid: false },
      { id: 's3', ten: 'Sếp', soTien: 500, personId: null, isPaid: true },
    ],
  });

  const { linked, outside, outsideTotal } = unpaidSponsors(ev);
  assert.equal(linked.length, 1);
  assert.equal(outside.length, 1);
  assert.equal(outsideTotal, 300, 'chỉ tính người ngoài chưa đưa tiền');
});

// ---- bất biến quan trọng ----

test('tổng thu không bao giờ vượt quá tổng chi', () => {
  const ev = makeEvent({
    organizerId: 'a',
    people: BA_NGUOI,
    rounds: [
      { id: 'r1', soTien: 800, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] },
      { id: 'r2', soTien: 140, nguoiTraId: 'b', thamGiaIds: ['a', 'b', 'c'] },
    ],
  });

  const s = computeSummary(ev);
  const tongPhaiTra = Object.values(s.phaiTra).reduce((x, v) => x + v, 0);
  assert.ok(tongPhaiTra <= 940, `thu ${tongPhaiTra} không được vượt chi 940`);
});

// ---- ai mời ai (trả hộ phần của người khác) ----

/**
 * Ví dụ gốc: A, B, C cùng nhậu, A mời B.
 * A trả 2 phần, C trả 1 phần, B không phải trả.
 */
test('mời: phần của người được mời dồn sang người mời', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } }],
  });
  const { phaiTra } = computeSummary(ev);
  assert.deepEqual(phaiTra, { a: 600, b: 0, c: 300 });
});

test('mời: tổng phải trả vẫn đúng bằng số tiền của khoản', () => {
  // Đây là lý do dời phần SAU khi chia, thay vì chia lại theo trọng số:
  // 1000 chia 3 làm tròn xuống là 333/333/333, chia lại theo 2:0:1 sẽ ra số khác.
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 1000, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } }],
  });
  const { phaiTra } = computeSummary(ev);
  assert.deepEqual(phaiTra, { a: 666, b: 0, c: 333 });
  assert.equal(phaiTra.a + phaiTra.b + phaiTra.c, 999, 'y hệt tổng khi không mời ai');
});

test('mời: không mời ai thì kết quả y như cũ', () => {
  const rounds = [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }];
  const khong = computeSummary(makeEvent({ people: BA_NGUOI, organizerId: 'a', rounds }));
  const rong = computeSummary(makeEvent({
    people: BA_NGUOI, organizerId: 'a',
    rounds: [{ ...rounds[0], ganhHo: {} }],
  }));
  assert.deepEqual(khong.phaiTra, { a: 300, b: 300, c: 300 });
  assert.deepEqual(rong.phaiTra, khong.phaiTra);
});

test('mời: một người mời được nhiều người', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a', c: 'a' } }],
  });
  assert.deepEqual(computeSummary(ev).phaiTra, { a: 900, b: 0, c: 0 });
});

test('mời: mỗi tăng một kiểu — tăng 1 được mời, tăng 2 tự trả', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [
      { id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } },
      { id: 'r2', soTien: 600, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: {} },
    ],
  });
  const { phaiTra } = computeSummary(ev);
  assert.deepEqual(phaiTra, { a: 800, b: 200, c: 500 });
  assert.equal(phaiTra.a + phaiTra.b + phaiTra.c, 1500);
});

// ---- các cặp mời không dùng được ----

test('mời: dây chuyền bị chặn — A mời B, B mời C thì bỏ cặp của B', () => {
  const r = { id: 'r1', soTien: 900, thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a', c: 'b' } };
  assert.deepEqual(ganhHoHopLe(r, new Set(['a', 'b', 'c'])), { b: 'a' });
});

test('mời: vòng lặp bị chặn — A mời B, B mời A thì bỏ cả hai', () => {
  const r = { id: 'r1', soTien: 900, thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a', a: 'b' } };
  assert.deepEqual(ganhHoHopLe(r, new Set(['a', 'b', 'c'])), {});
});

test('mời: bỏ cặp khi người được mời không tham gia khoản đó', () => {
  const r = { id: 'r1', soTien: 900, thamGiaIds: ['a', 'c'], ganhHo: { b: 'a' } };
  assert.deepEqual(ganhHoHopLe(r, new Set(['a', 'b', 'c'])), {});
});

test('mời: bỏ cặp khi một trong hai người đã rời buổi', () => {
  const r = { id: 'r1', soTien: 900, thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } };
  assert.deepEqual(ganhHoHopLe(r, new Set(['b', 'c'])), {}, 'người mời đã bị xoá');
  assert.deepEqual(ganhHoHopLe(r, new Set(['a', 'c'])), {}, 'người được mời đã bị xoá');
});

test('mời: người mời rời buổi -> người được mời trả lại phần của mình', () => {
  const ev = makeEvent({
    people: [{ id: 'b', name: 'HungNN14' }, { id: 'c', name: 'PhongTH4' }],
    organizerId: 'b',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'c', thamGiaIds: ['b', 'c'], ganhHo: { b: 'a' } }],
  });
  assert.deepEqual(computeSummary(ev).phaiTra, { b: 450, c: 450 });
});

test('mời: người mời không dự khoản đó vẫn gánh được', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['b', 'c'], ganhHo: { b: 'a' } }],
  });
  // A không đi tăng này nên không có phần của mình, nhưng nhận phần của B.
  assert.deepEqual(computeSummary(ev).phaiTra, { a: 450, b: 0, c: 450 });
});

// ---- mời + tài trợ ----

test('mời + tài trợ: người được mời về 0, KHÔNG âm', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } }],
    sponsors: [{ id: 's1', ten: 'Sếp', soTien: 300, isPaid: true }],
  });
  const { phaiTra } = computeSummary(ev);
  // Không dồn giảm trừ thì B ra -100, như thể B được nhận lại tiền.
  assert.deepEqual(phaiTra, { a: 400, b: 0, c: 200 });
  assert.equal(phaiTra.a + phaiTra.b + phaiTra.c, 600, 'tổng chi 900 trừ tài trợ 300');
});

test('mời + tài trợ: được mời một nửa thì chuyển một nửa phần giảm trừ', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [
      { id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } },
      { id: 'r2', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: {} },
    ],
    sponsors: [{ id: 's1', ten: 'Sếp', soTien: 300, isPaid: true }],
  });
  const { phaiTra } = computeSummary(ev);
  // B: 2 tăng x 300 = 600, bị gánh 300 -> tỉ lệ 1/2 -> chuyển 50 trong 100.
  assert.deepEqual(phaiTra, { a: 750, b: 250, c: 500 });
  assert.equal(phaiTra.a + phaiTra.b + phaiTra.c, 1500, 'tổng chi 1800 trừ tài trợ 300');
});

test('mời + tài trợ: không mời ai thì phần tài trợ tính y như cũ', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'] }],
    sponsors: [{ id: 's1', ten: 'Sếp', soTien: 300, isPaid: true }],
  });
  assert.deepEqual(computeSummary(ev).phaiTra, { a: 200, b: 200, c: 200 });
});

// ---- chuyển khoản ----

test('mời: người được mời không nằm trong danh sách cần chuyển khoản', () => {
  const ev = makeEvent({
    people: BA_NGUOI,
    organizerId: 'a',
    rounds: [{ id: 'r1', soTien: 900, nguoiTraId: 'a', thamGiaIds: ['a', 'b', 'c'], ganhHo: { b: 'a' } }],
  });
  const settlement = computeSettlement(ev, computeSummary(ev));
  assert.deepEqual(settlement, [{ fromId: 'c', toId: 'a', amount: 300 }]);
});
