import { useEffect, useState } from "react";

const DOC_TYPE_LABELS: Record<string, string> = {
  pitch_deck: "Pitch Deck",
  technical_deck: "Technical Deck",
  bd_strategy: "BD Strategy",
  sow: "Statement of Work",
  project_brief: "Project Brief",
  idea_validation_report: "Idea Validation Report",
  business_requirement_document: "Business Requirement Document",
  project_requirement_document: "Project Requirement Document",
  mvp_scope_document: "MVP Scope Document",
  technical_architecture_document: "Technical Architecture Document",
  feature_list_document: "Feature List Document",
  development_roadmap: "Development Roadmap",
};

interface GeneratedDoc {
  _id?: string;
  title: string;
  documentType: string;
  content: string;
  messageCount?: number;
}

interface DocModalProps {
  doc: GeneratedDoc | null;
  onClose: () => void;
}

export function DocModal({ doc, onClose }: DocModalProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [doc, onClose]);

  if (!doc) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(doc.content);
  };

  const download = () => {
    const blob = new Blob([doc.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!doc || !doc._id) return;
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/ai/documents/${doc._id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to download PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message ?? "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const label = DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0812]/98 backdrop-blur-md">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 bg-background/60 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">Document Mode</span>
          </div>
          <span className="text-border/40">·</span>
          <span className="font-semibold text-sm truncate">{doc.title}</span>
          <span className="shrink-0 text-xs px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary font-medium">
            {label}
          </span>
          {doc.messageCount != null && (
            <span className="text-xs text-muted-foreground/50 hidden sm:inline">
              {doc.messageCount} messages
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-md px-3 py-1.5 hover:border-border/70 hover:bg-card/50"
          >
            Copy
          </button>
          <button
            onClick={download}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-md px-3 py-1.5 hover:border-border/70 hover:bg-card/50"
          >
            Download .txt
          </button>
          {doc._id && (
            <button
              onClick={downloadPdf}
              disabled={downloadingPdf}
              className="text-xs text-primary hover:text-primary-foreground hover:bg-primary/90 transition-colors border border-primary/40 rounded-md px-3 py-1.5 hover:border-primary bg-primary/10 disabled:opacity-50"
            >
              {downloadingPdf ? "Generating PDF..." : "Download PDF"}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40 rounded-md px-3 py-1.5 hover:border-border/70 hover:bg-card/50 ml-1"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <pre className="text-sm text-foreground/85 whitespace-pre-wrap font-mono leading-relaxed">
            {doc.content}
          </pre>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/40 px-6 py-2.5 flex items-center justify-between bg-background/40">
        <span className="text-[10px] text-muted-foreground/40">
          Generated by DEHIX Live Room · Esc to close
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={copy}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
          >
            Copy to clipboard
          </button>
          <button
            onClick={download}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Download .txt
          </button>
          {doc._id && (
            <button
              onClick={downloadPdf}
              disabled={downloadingPdf}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium disabled:opacity-50"
            >
              {downloadingPdf ? "Generating PDF..." : "Download PDF"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
