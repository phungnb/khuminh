// Tạo chuỗi QR chuyển khoản theo chuẩn VietQR (EMVCo Merchant-Presented QR, Napas 247).
// Chỉ tạo chuỗi; không gọi dịch vụ bên ngoài, không đối soát.

export interface VietQrInput {
  /** Mã BIN ngân hàng 6 số, ví dụ Vietcombank 970436. */
  bankBin: string;
  accountNo: string;
  /** Số tiền đồng; bỏ trống thì người trả tự nhập. */
  amount?: number;
  /** Nội dung chuyển khoản, nên là mã hóa đơn. Tối đa 25 ký tự ASCII để an toàn với mọi ngân hàng. */
  message?: string;
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new Error(`Trường ${id} quá dài`);
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), như EMVCo yêu cầu. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bỏ dấu tiếng Việt và ký tự lạ để nội dung chuyển khoản không bị ngân hàng cắt. */
export function sanitizeMessage(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, 25);
}

export function buildVietQr(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bankBin)) throw new Error("Mã BIN ngân hàng phải có 6 chữ số");
  if (!/^[0-9A-Za-z]{1,19}$/.test(input.accountNo)) throw new Error("Số tài khoản không hợp lệ");
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) {
    throw new Error("Số tiền QR phải là số nguyên dương");
  }

  const beneficiary = tlv("00", input.bankBin) + tlv("01", input.accountNo);
  const merchant = tlv("00", "A000000727") + tlv("01", beneficiary) + tlv("02", "QRIBFTTA");

  let payload =
    tlv("00", "01") +
    tlv("01", input.amount ? "12" : "11") +
    tlv("38", merchant) +
    tlv("53", "704") +
    (input.amount ? tlv("54", String(input.amount)) : "") +
    tlv("58", "VN");
  const msg = input.message ? sanitizeMessage(input.message) : "";
  if (msg) payload += tlv("62", tlv("08", msg));
  payload += "6304";
  return payload + crc16(payload);
}

/** Một số ngân hàng phổ biến; danh sách đầy đủ theo Napas. */
export const COMMON_BANKS: Array<{ bin: string; name: string }> = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970416", name: "ACB" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
];
