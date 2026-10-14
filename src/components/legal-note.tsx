import Link from "next/link";

/** Dòng đồng ý điều khoản dưới các form tạo tài khoản. */
export function LegalNote() {
  return (
    <p className="text-xs text-fg-subtle">
      Tiếp tục nghĩa là bạn đồng ý với <Link className="underline" href="/dieu-khoan">Điều khoản</Link> và{" "}
      <Link className="underline" href="/rieng-tu">Chính sách riêng tư</Link>.
    </p>
  );
}

/** Chân trang công khai: điều khoản, riêng tư, hỗ trợ. */
export function LegalFooter({ support }: { support: string | null }) {
  return (
    <footer className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
      <Link href="/dieu-khoan">Điều khoản</Link>
      <Link href="/rieng-tu">Riêng tư</Link>
      {support ? <span>Hỗ trợ: {support}</span> : null}
    </footer>
  );
}
