import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { DocModal } from "@/components/DocModal";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  Check,
  Download,
  FileText,
  Hash,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";

type Channel = {
  _id: string;
  type: "general" | "direct";
  name: string;
  displayName: string;
  participantIds: string[];
  roleId?: string | null;
};

type RoomMessage = {
  _id: string;
  id: string;
  channelId: string;
  senderId?: string | null;
  senderName: string;
  type: "user" | "system" | "ai";
  message: string;
  mentions: string[];
  isAi?: boolean;
  createdAt: string;
};

type WorkspaceDocument = {
  docType: string;
  title: string;
  source: "standard" | "generated";
  documentId?: string | null;
  canView: boolean;
};

type PermissionTalent = {
  participantId: string;
  talentId: string;
  name: string;
  email?: string | null;
  roleTitle?: string | null;
  status: string;
  documents: Array<{
    docType: string;
    title: string;
    canView: boolean;
  }>;
};

type WorkspacePayload = {
  room: any;
  roles: any[];
  participants: any[];
  tickets: any[];
  milestones: any[];
  nda: any | null;
  channels: Channel[];
  documents: WorkspaceDocument[];
  permissionMatrix: PermissionTalent[];
  currentUserAccess: {
    isOwner: boolean;
    participantId?: string | null;
    status?: string | null;
    canManageDocuments: boolean;
    canSeeAllChannels: boolean;
  };
};

let localFallbackId = 0;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("dehix_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function MarkdownMini({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];

  const flush = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ul key={key} className="list-disc pl-4 my-2 space-y-1">
        {list}
      </ul>
    );
    list = [];
  };

  const inline = (line: string) =>
    line.split(/(\*\*.*?\*\*|`.*?`|@dehixai)/gi).map((part, index) => {
      if (part.toLowerCase() === "@dehixai") {
        return <span key={index} className="font-bold text-primary">@dehixai</span>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[11px]">{part.slice(1, -1)}</code>;
      }
      return part;
    });

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush(`flush-${index}`);
      return;
    }
    if (trimmed.startsWith("- ")) {
      list.push(<li key={index}>{inline(trimmed.slice(2))}</li>);
      return;
    }
    flush(`flush-${index}`);
    out.push(
      <p key={index} className="leading-relaxed whitespace-pre-wrap">
        {inline(trimmed)}
      </p>
    );
  });
  flush("end");
  return <>{out}</>;
}

export default function LiveRoomPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const roomId = id ?? "";
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);
  const [docModal, setDocModal] = useState<{ title: string; documentType: string; content: string; messageCount?: number } | null>(null);
  const [permissionSaving, setPermissionSaving] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const selectedChannel = useMemo(
    () => workspace?.channels.find((channel) => channel._id === selectedChannelId) ?? null,
    [workspace, selectedChannelId]
  );
  const isOwner = Boolean(workspace?.currentUserAccess?.isOwner);
  const room = workspace?.room;

  const mergeMessage = (incoming: RoomMessage) => {
    setMessages((prev) => {
      if (prev.some((message) => message.id === incoming.id || message._id === incoming._id)) return prev;
      return [...prev, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  };

  const loadWorkspace = async (preferredChannelId?: string) => {
    if (!roomId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/workspace`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load workspace");
      setWorkspace(data);
      const nextChannel =
        preferredChannelId && data.channels.some((channel: Channel) => channel._id === preferredChannelId)
          ? preferredChannelId
          : selectedChannelId && data.channels.some((channel: Channel) => channel._id === selectedChannelId)
            ? selectedChannelId
            : data.channels.find((channel: Channel) => channel.type === "general")?._id ?? data.channels[0]?._id ?? "";
      setSelectedChannelId(nextChannel);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load workspace");
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channelId: string) => {
    if (!roomId || !channelId) return;
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/channels/${channelId}/messages`, { headers: authHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error ?? "Failed to load messages");
      setMessages(Array.isArray(data) ? data : []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [roomId]);

  useEffect(() => {
    if (selectedChannelId) void loadMessages(selectedChannelId);
  }, [selectedChannelId, roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    const socketUrl = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, "");
    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem("dehix_token") },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.emit("room:join", { roomId });
    socket.on("connect_error", () => toast.error("Realtime connection failed. Please sign in again."));
    socket.on("room:error", ({ error }: { error: string }) => toast.error(error));
    socket.on("room:message_created", (message: RoomMessage) => {
      if (message.channelId === selectedChannelId) mergeMessage(message);
    });
    socket.on("room:channel_created", () => void loadWorkspace(selectedChannelId));
    socket.on("room:participant_joined", () => void loadWorkspace(selectedChannelId));
    socket.on("room:participant_invited", () => void loadWorkspace(selectedChannelId));
    socket.on("room:participant_removed", () => void loadWorkspace(selectedChannelId));
    socket.on("room:document_permission_updated", () => void loadWorkspace(selectedChannelId));
    socket.on("room:status_changed", () => void loadWorkspace(selectedChannelId));
    return () => {
      socket.disconnect();
    };
  }, [roomId, user?._id, selectedChannelId]);

  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!text || !roomId || !selectedChannelId || sending) return;
    setSending(true);
    setMessageInput("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send message");
      if (data.message) mergeMessage(data.message);
      if (data.aiMessage) mergeMessage(data.aiMessage);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send message");
      const fallback: RoomMessage = {
        _id: `local-${++localFallbackId}`,
        id: `local-${localFallbackId}`,
        channelId: selectedChannelId,
        senderId: user?._id,
        senderName: user?.name ?? "You",
        type: "user",
        message: text,
        mentions: [],
        createdAt: new Date().toISOString(),
      };
      mergeMessage(fallback);
    } finally {
      setSending(false);
    }
  };

  const openDocument = async (doc: WorkspaceDocument) => {
    setOpeningDoc(doc.docType);
    try {
      const res = await fetch(`/api/rooms/${roomId}/documents/${encodeURIComponent(doc.docType)}`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to open document");
      setDocModal(data);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to open document");
    } finally {
      setOpeningDoc(null);
    }
  };

  const downloadDocument = async (doc: WorkspaceDocument) => {
    try {
      const url = doc.source === "generated" && doc.documentId
        ? `/api/ai/documents/${doc.documentId}/pdf`
        : `/api/rooms/${roomId}/documents/${encodeURIComponent(doc.docType)}/pdf`;
      const res = await fetch(url, { headers: authHeaders() });
      const blob = await res.blob();
      if (!res.ok) {
        const text = await blob.text().catch(() => "");
        throw new Error(text ? JSON.parse(text).error : "Failed to download document");
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${doc.title.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download document");
    }
  };

  const downloadZip = async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/documents-zip`, { headers: authHeaders() });
      const blob = await res.blob();
      if (!res.ok) {
        const text = await blob.text().catch(() => "");
        throw new Error(text ? JSON.parse(text).error : "Failed to download ZIP");
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${room?.roomCode ?? "room"}-documents.zip`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download ZIP");
    }
  };

  const togglePermission = async (talent: PermissionTalent, doc: PermissionTalent["documents"][number]) => {
    const key = `${talent.participantId}:${doc.docType}`;
    setPermissionSaving(key);
    try {
      const res = await fetch(`/api/rooms/${roomId}/document-permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          participantId: talent.participantId,
          docType: doc.docType,
          canView: !doc.canView,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update permission");
      await loadWorkspace(selectedChannelId);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update permission");
    } finally {
      setPermissionSaving(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">Please sign in to join this room</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading workspace...</div>
      </div>
    );
  }

  if (!workspace || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">Room not found or access is not available.</p>
          <Button onClick={() => navigate(user.role === "business" ? "/business/dashboard" : "/talent/dashboard")}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen bg-background text-foreground flex overflow-hidden">
        <aside className="w-[342px] shrink-0 border-r border-border/40 bg-card/45 flex flex-col">
          <div className="h-14 px-4 border-b border-border/40 flex items-center gap-2">
            <button
              onClick={() => navigate(user.role === "business" ? "/business/dashboard" : "/talent/dashboard")}
              className="h-8 w-8 rounded-md hover:bg-muted/70 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{room.title}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{room.roomCode} · {room.status}</div>
            </div>
            <button
              onClick={() => void loadWorkspace(selectedChannelId)}
              className="h-8 w-8 rounded-md hover:bg-muted/70 inline-flex items-center justify-center text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <section>
              <PanelHeader icon={<MessageSquare className="h-3.5 w-3.5" />} label="Channels" count={workspace.channels.length} />
              <div className="space-y-1.5">
                {workspace.channels.map((channel) => (
                  <button
                    key={channel._id}
                    onClick={() => setSelectedChannelId(channel._id)}
                    className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      selectedChannelId === channel._id
                        ? "bg-primary/12 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent"
                    }`}
                  >
                    {channel.type === "general" ? <Hash className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    <span className="truncate font-semibold">{channel.displayName}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <PanelHeader icon={<Users className="h-3.5 w-3.5" />} label="Participants" count={workspace.participants.length} />
              <div className="space-y-2">
                {workspace.participants.map((participant: any) => {
                  const person = participant.user ?? participant.userId;
                  const role = workspace.roles.find((item) => String(item._id) === String(participant.roleId));
                  return (
                    <div key={participant._id} className="rounded-md border border-border/40 bg-background/45 p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary border border-primary/20 inline-flex items-center justify-center text-xs font-bold">
                          {person?.name?.[0]?.toUpperCase() ?? "T"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">{person?.name ?? "Talent"}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{role?.roleTitle ?? "No role"} · {participant.status}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <PanelHeader icon={<FileText className="h-3.5 w-3.5" />} label={isOwner ? "Documents" : "Allowed Docs"} count={workspace.documents.length} />
              <div className="space-y-2">
                {workspace.documents.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground">No documents are available yet.</p>
                ) : (
                  workspace.documents.map((doc) => (
                    <div key={`${doc.source}:${doc.documentId ?? doc.docType}`} className="rounded-md border border-border/40 bg-background/45 p-2.5">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold leading-snug">{doc.title}</div>
                          <div className="text-[10px] text-muted-foreground capitalize">{doc.source}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <button
                          onClick={() => void openDocument(doc)}
                          disabled={openingDoc === doc.docType}
                          className="text-[10px] font-semibold rounded-md border border-border/45 px-2 py-1.5 hover:bg-muted/55 disabled:opacity-50"
                        >
                          {openingDoc === doc.docType ? "Opening" : "Preview"}
                        </button>
                        <button
                          onClick={() => void downloadDocument(doc)}
                          className="text-[10px] font-semibold rounded-md border border-border/45 px-2 py-1.5 hover:bg-muted/55 inline-flex items-center justify-center gap-1"
                        >
                          <Download className="h-3 w-3" /> PDF
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={() => void downloadZip()}
                  className="w-full text-[10px] font-bold rounded-md border border-primary/25 text-primary bg-primary/5 px-2 py-2 hover:bg-primary/10"
                >
                  Download visible docs as ZIP
                </button>
              </div>
            </section>

            <section>
              <PanelHeader icon={<Briefcase className="h-3.5 w-3.5" />} label="Roles and Tasks" count={workspace.roles.length} />
              <div className="space-y-2">
                {workspace.roles.map((role) => {
                  const roleTickets = workspace.tickets.filter((ticket) => String(ticket.assignedRole ?? "") === String(role._id));
                  return (
                    <div key={role._id} className="rounded-md border border-border/40 bg-background/45 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold truncate">{role.roleTitle}</div>
                        <span className="text-[9px] rounded border border-border/45 px-1.5 py-0.5 text-muted-foreground">{role.status}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-1">{role.skillDomain}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{roleTickets.length} assigned ticket{roleTickets.length === 1 ? "" : "s"}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {isOwner && (
              <section>
                <PanelHeader icon={<Shield className="h-3.5 w-3.5" />} label="Access Control" count={workspace.permissionMatrix.length} />
                <div className="space-y-3">
                  {workspace.permissionMatrix.map((talent) => (
                    <div key={talent.participantId} className="rounded-md border border-border/45 bg-background/55 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-primary" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{talent.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{talent.roleTitle ?? "No role"} · {talent.status}</div>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {talent.documents.map((doc) => {
                          const key = `${talent.participantId}:${doc.docType}`;
                          return (
                            <button
                              key={doc.docType}
                              onClick={() => void togglePermission(talent, doc)}
                              disabled={permissionSaving === key}
                              className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[10px] transition-colors ${
                                doc.canView
                                  ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
                                  : "border-border/35 bg-muted/15 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {doc.canView ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{doc.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col bg-background">
          <header className="h-14 shrink-0 border-b border-border/40 px-5 flex items-center justify-between gap-3 bg-background/75">
            <div className="flex items-center gap-2 min-w-0">
              {selectedChannel?.type === "general" ? <Hash className="h-4 w-4 text-muted-foreground" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{selectedChannel?.displayName ?? "Channel"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {selectedChannel?.type === "general"
                    ? "General chat. Mention @dehixai when you want AI to participate."
                    : "Private business-talent conversation."}
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Permission-aware AI
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {loadingMessages ? (
              <div className="text-sm text-muted-foreground animate-pulse">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-sm space-y-3">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                  <div className="text-sm font-semibold text-foreground/80">No messages yet</div>
                  <p className="text-xs text-muted-foreground">Start the conversation or call <span className="font-bold text-primary">@dehixai</span> for project help.</p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} isMine={message.senderId === user._id} />
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-border/40 p-4 bg-background/80">
            <div className="rounded-xl border border-border/50 bg-card/50 p-2 focus-within:border-primary/40 transition-colors">
              <textarea
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={2}
                placeholder={`Message ${selectedChannel?.displayName ?? "channel"}... use @dehixai for AI`}
                className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/45"
              />
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="text-[10px] text-muted-foreground">
                  @dehixai replies with context filtered by document permissions.
                </div>
                <Button size="sm" onClick={() => void sendMessage()} disabled={!messageInput.trim() || sending} className="h-8 text-xs font-bold">
                  {sending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border border-white/40 border-t-white animate-spin" />
                      Sending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Send
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {docModal && <DocModal doc={docModal} onClose={() => setDocModal(null)} />}
    </>
  );
}

function PanelHeader({ icon, label, count }: { icon: ReactNode; label: string; count?: number }) {
  return (
    <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {typeof count === "number" && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px]">{count}</span>}
    </div>
  );
}

function MessageBubble({ message, isMine }: { message: RoomMessage; isMine: boolean }) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-border/45 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground">
          {message.message}
        </div>
      </div>
    );
  }

  const isAi = message.type === "ai";
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isAi
            ? "border border-primary/20 bg-primary/5 text-foreground"
            : isMine
              ? "bg-primary text-primary-foreground"
              : "border border-border/45 bg-card text-foreground"
        }`}
      >
        <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold ${isMine && !isAi ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {isAi ? <Bot className="h-3.5 w-3.5 text-primary" /> : null}
          <span>{isAi ? "DEHIX AI" : message.senderName}</span>
          <span className="font-mono opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className={isMine && !isAi ? "text-primary-foreground" : "text-foreground"}>
          <MarkdownMini text={message.message} />
        </div>
      </div>
    </div>
  );
}
