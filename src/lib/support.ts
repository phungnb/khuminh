/** Kênh hỗ trợ hiển thị cho người dùng (Zalo/SĐT/email), đặt bằng NEXT_PUBLIC_SUPPORT_CONTACT. Chưa đặt thì ẩn. */
export function supportContact(): string | null {
  return process.env.NEXT_PUBLIC_SUPPORT_CONTACT?.trim() || null;
}
