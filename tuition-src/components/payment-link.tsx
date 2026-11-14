import { ExternalLink, ReceiptText } from "lucide-react";

export default function PaymentLink({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "payment-card payment-card-compact" : "payment-card"} aria-label="ชำระค่าบำรุงการศึกษา">
      {!compact && <div className="payment-card-icon"><ReceiptText aria-hidden="true" /></div>}
      <div className="payment-card-copy">
        <p className="payment-card-kicker">ภาคเรียนที่ 2 ปีการศึกษา 2569</p>
        {!compact && <h2>ชำระค่าบำรุงการศึกษา</h2>}
        <p>พิมพ์ใบแจ้งชำระเงิน เพื่อนำไปชำระผ่านธนาคารหรือแอปธนาคาร</p>
        <p className="payment-card-period">ชำระออนไลน์ 23 พ.ย. 2569 – 10 ม.ค. 2570</p>
      </div>
      <a className="payment-card-button" href="http://sb.schoolbillingdev31.com/SBCNR/Pages/PrintReportPayInForStudent.aspx" target="_blank" rel="noopener noreferrer">
        พิมพ์ใบแจ้งชำระเงิน <ExternalLink aria-hidden="true" />
        <span className="sr-only"> (เปิดในแท็บใหม่)</span>
      </a>
    </section>
  );
}
