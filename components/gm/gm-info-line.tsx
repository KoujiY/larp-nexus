/**
 * GM 側展開區塊共用的 label：value 資訊行
 *
 * 用於 AbilityCard（檢定資訊、使用限制）、TaskCard（GM 備註、揭露條件）等
 * 展開內容中的結構化資訊顯示。
 */
export function GmInfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-foreground/90">
      <span className="text-muted-foreground">{label}：</span>
      {value}
    </p>
  );
}
