import { motion } from "motion/react";
import type { ApprovalRecord, ApprovalRequest } from "@/lib/kernel/types";
import { KButton } from "./ui";

export function ApprovalCard({
  request,
  onDecide,
  record,
}: {
  request: ApprovalRequest | ApprovalRecord;
  onDecide?: (ok: boolean) => void;
  record?: boolean;
}) {
  const decided = record ? (request as ApprovalRecord).decision : null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="glass rounded-2xl p-4"
      aria-label="Approval request"
      role={record ? undefined : "alertdialog"}
    >
      <p className="label-mono text-muted-foreground">
        {decided ? (decided === "allowed" ? "Allowed once" : "Denied") : "Needs your approval"}
      </p>
      <h3 className="mt-2 text-lg">{request.title}</h3>
      {!decided && (
        <>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-foreground/5 p-3 font-mono text-xs leading-relaxed">
            {request.preview}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <KButton variant="glass" onClick={() => onDecide?.(false)}>
              Deny
            </KButton>
            <KButton variant="primary" onClick={() => onDecide?.(true)} autoFocus>
              Allow once
            </KButton>
          </div>
        </>
      )}
    </motion.section>
  );
}
