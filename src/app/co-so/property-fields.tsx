import { COMMON_BANKS } from "@/domain/vietqr";

interface Values {
  name?: string;
  address?: string | null;
  roundTotalTo?: number;
  dueDays?: number;
  bankBin?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
}

export function PropertyFields({ v = {} }: { v?: Values }) {
  return (
    <>
      <div>
        <label className="label" htmlFor="name">Tên cơ sở</label>
        <input className="input" id="name" name="name" defaultValue={v.name} placeholder="Dãy trọ số 5" required />
      </div>
      <div>
        <label className="label" htmlFor="address">Địa chỉ</label>
        <input className="input" id="address" name="address" defaultValue={v.address ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="dueDays">Hạn trả sau cuối kỳ (ngày)</label>
          <input className="input" id="dueDays" name="dueDays" inputMode="numeric" defaultValue={v.dueDays ?? 10} />
        </div>
        <div>
          <label className="label" htmlFor="roundTotalTo">Làm tròn tổng</label>
          <select className="input" id="roundTotalTo" name="roundTotalTo" defaultValue={String(v.roundTotalTo ?? 1000)}>
            <option value="1">Không làm tròn</option>
            <option value="100">Tới 100đ</option>
            <option value="500">Tới 500đ</option>
            <option value="1000">Tới 1.000đ</option>
          </select>
        </div>
      </div>
      <fieldset className="space-y-3 rounded-md border border-stone-200 p-3">
        <legend className="px-1 text-sm font-medium text-stone-700">Tài khoản nhận tiền (để tạo mã QR)</legend>
        <div>
          <label className="label" htmlFor="bankBin">Ngân hàng</label>
          <select className="input" id="bankBin" name="bankBin" defaultValue={v.bankBin ?? ""}>
            <option value="">Chưa chọn</option>
            {COMMON_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bankAccountNo">Số tài khoản</label>
          <input className="input" id="bankAccountNo" name="bankAccountNo" inputMode="numeric" defaultValue={v.bankAccountNo ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="bankAccountName">Tên chủ tài khoản</label>
          <input className="input" id="bankAccountName" name="bankAccountName" defaultValue={v.bankAccountName ?? ""} />
        </div>
      </fieldset>
    </>
  );
}
