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
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
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
  Video,
  X,
  Trash2,
} from "lucide-react";

type Channel = {
  _id: string;
  type: "general" | "direct" | "interview";
  name: string;
  displayName: string;
  participantIds: string[];
  roleId?: string | null;
  interviewStatus?: "scheduled" | "live" | "completed" | "cancelled" | null;
  interviewMeetLink?: string | null;
  interviewScheduledAt?: string | null;
  interviewNotes?: string | null;
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

type HireOffer = {
  _id: string;
  roomId: string;
  freelancerId: string;
  freelancer?: { _id: string; name: string; email?: string | null } | null;
  roleId: string;
  role?: { _id: string; roleTitle: string; skillDomain?: string; status?: string } | null;
  interviewChannelId: string;
  status: "draft" | "sent" | "accepted" | "declined" | "changes_requested" | "withdrawn" | "expired" | "contracted";
  amountUsd?: number | null;
  rateType: "fixed" | "hourly" | "weekly" | "monthly";
  rateAmountUsd?: number | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  scopeSummary: string;
  terms: string;
  milestonePlan?: Array<{ title: string; description?: string; amountUsd?: number; dueDate?: string | null }>;
  responseMessage?: string | null;
  sentAt?: string | null;
  respondedAt?: string | null;
  contractedAt?: string | null;
  createdAt?: string | null;
};

type WorkspacePayload = {
  room: any;
  roles: any[];
  participants: any[];
  tickets: any[];
  milestones: any[];
  nda: any | null;
  offers: HireOffer[];
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

type CommandPreview = {
  commandId: string;
  action: string;
  summary: string;
  targets: Array<{
    participantId: string;
    talentId: string;
    name: string;
    email?: string;
    status?: string;
    roleId?: string | null;
  }>;
  warnings?: string[];
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
};

let localFallbackId = 0;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("dehix_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function MarkdownMini({ text, isMine }: { text: string; isMine?: boolean }) {
  if (!text) return null;
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];

  const flush = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ul key={key} className="list-disc pl-4 my-1 space-y-1">
        {list}
      </ul>
    );
    list = [];
  };

  const inline = (line: string) =>
    line.split(/(\*\*.*?\*\*|`.*?`|@dehixai)/gi).map((part, index) => {
      if (part.toLowerCase() === "@dehixai") {
        return (
          <span 
            key={index} 
            className="font-bold text-primary dark:text-violet-400 underline underline-offset-2 decoration-1"
          >
            @dehixai
          </span>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code 
            key={index} 
            className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-medium ${
              isMine 
                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100" 
                : "bg-slate-100 dark:bg-slate-800 text-foreground border border-border/30"
            }`}
          >
            {part.slice(1, -1)}
          </code>
        );
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
      list.push(<li key={index} className="leading-relaxed">{inline(trimmed.slice(2))}</li>);
      return;
    }
    flush(`flush-${index}`);
    out.push(
      <p key={index} className="leading-relaxed whitespace-pre-wrap mb-1.5 last:mb-0">
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
  const [pendingCommand, setPendingCommand] = useState<CommandPreview | null>(null);
  const [commandLoading, setCommandLoading] = useState(false);
  const [showInterviewNotes, setShowInterviewNotes] = useState(false);
  const [interviewNotesDraft, setInterviewNotesDraft] = useState("");
  const [interviewSaving, setInterviewSaving] = useState(false);
  const [showMeetLinkForm, setShowMeetLinkForm] = useState(false);
  const [meetLinkDraft, setMeetLinkDraft] = useState("");
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerCandidateId, setOfferCandidateId] = useState("");
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerDraft, setOfferDraft] = useState({
    amountUsd: "",
    rateType: "fixed",
    rateAmountUsd: "",
    startDate: "",
    expectedEndDate: "",
    scopeSummary: "",
    terms: "",
    milestonePlanText: "",
  });
  const socketRef = useRef<Socket | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // States from 3-panel / design enhancements layout
  const [activeTab, setActiveTab] = useState<"channels" | "roles">("channels");
  const [expandedDocType, setExpandedDocType] = useState<string | null>(null);
  const [lastSentText, setLastSentText] = useState("");
  const [accessSearch, setAccessSearch] = useState("");
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [expandedPermissions, setExpandedPermissions] = useState<Record<string, boolean>>({});
  const [invitedOpen, setInvitedOpen] = useState(false);

  const selectedChannel = useMemo(
    () => workspace?.channels.find((channel) => channel._id === selectedChannelId) ?? null,
    [workspace, selectedChannelId]
  );
  const isOwner = Boolean(workspace?.currentUserAccess?.isOwner);
  const room = workspace?.room;

  // Sorting logic from old codebase
  const sortedChannels = useMemo(() => {
    if (!workspace?.channels) return [];
    return [...workspace.channels].sort((a, b) => {
      // 1. Group check: non-direct (general/ai-agent/interview) channels come before direct messages
      const aIsGeneral = a.type !== "direct";
      const bIsGeneral = b.type !== "direct";
      if (aIsGeneral !== bIsGeneral) {
        return aIsGeneral ? -1 : 1;
      }
      
      // 2. Sorting within their respective groups
      if (aIsGeneral) {
        // "general" is first
        if (a.name === "general") return -1;
        if (b.name === "general") return 1;
        
        // "ai-agent" is second
        if (a.name === "ai-agent") return -1;
        if (b.name === "ai-agent") return 1;
        
        // Others sorted alphabetically by displayName
        return a.displayName.localeCompare(b.displayName);
      } else {
        // Direct messages sorted alphabetically by displayName
        return a.displayName.localeCompare(b.displayName);
      }
    });
  }, [workspace?.channels]);

  // Filtering for access control panel
  const filteredMatrix = useMemo(() => {
    if (!workspace?.permissionMatrix) return [];
    return workspace.permissionMatrix.filter((talent) =>
      talent.name.toLowerCase().includes(accessSearch.toLowerCase()) ||
      (talent.roleTitle ?? "").toLowerCase().includes(accessSearch.toLowerCase())
    );
  }, [workspace?.permissionMatrix, accessSearch]);

  const regularChannels = useMemo(
    () => sortedChannels.filter((channel) => channel.type !== "interview" && channel.type !== "direct") ?? [],
    [sortedChannels]
  );
  const interviewChannels = useMemo(
    () => sortedChannels.filter((channel) => channel.type === "interview") ?? [],
    [sortedChannels]
  );
  const directChannels = useMemo(
    () => sortedChannels.filter((channel) => channel.type === "direct") ?? [],
    [sortedChannels]
  );

  const talentParticipants = useMemo(
    () => (workspace?.participants ?? []).filter((participant: any) => String(participant.userId?._id ?? participant.talentId ?? participant.userId) !== String(room?.businessId)),
    [workspace, room?.businessId]
  );

  const commandSuggestions = useMemo(() => {
    if (!isOwner) return [{ command: "/help", label: "Show commands" }];
    return [
      { command: "/interview @", label: "Create interview channel" },
      ...(selectedChannel?.type === "interview" ? [{ command: "/meet", label: "Share interview Meet" }] : []),
      { command: "/remove @", label: "Remove talent" },
      { command: "/help", label: "Show commands" },
    ];
  }, [isOwner, selectedChannel?.type]);

  const mentionFragment = (() => {
    const match = messageInput.match(/@([^@\n]*)$/);
    return match ? match[1]!.trim().toLowerCase() : "";
  })();

  const mentionSuggestions = messageInput.includes("@")
    ? talentParticipants
        .filter((participant: any) => {
          const person = participant.user ?? participant.userId;
          const name = String(person?.name ?? participant.name ?? "");
          return !mentionFragment || name.toLowerCase().includes(mentionFragment);
        })
        .slice(0, 5)
    : [];

  const selectedChannelParticipants = useMemo(() => {
    if (!selectedChannel || selectedChannel.type !== "interview") return [];
    const ids = new Set(selectedChannel.participantIds.map(String));
    return talentParticipants.filter((participant: any) => {
      const person = participant.user ?? participant.userId;
      return ids.has(String(person?._id ?? participant.talentId ?? participant.userId));
    });
  }, [selectedChannel, talentParticipants]);

  const offerCandidate = useMemo(() => {
    return selectedChannelParticipants.find((participant: any) => {
      const person = participant.user ?? participant.userId;
      return String(person?._id ?? participant.talentId ?? participant.userId) === offerCandidateId;
    }) ?? selectedChannelParticipants[0] ?? null;
  }, [offerCandidateId, selectedChannelParticipants]);

  const roomOffers = workspace?.offers ?? [];

  useEffect(() => {
    if (workspace?.documents.length && expandedDocType === null) {
      setExpandedDocType(workspace.documents[0].docType);
    }
  }, [workspace, expandedDocType]);

  const mergeMessage = (incoming: RoomMessage) => {
    setMessages((prev) => {
      let filtered = prev;
      if (incoming.senderId === user?._id && incoming.type === "user") {
        const tempIdx = filtered.findIndex(m => m.id.startsWith("temp-") && m.message === incoming.message);
        if (tempIdx !== -1) {
          filtered = filtered.filter((_, idx) => idx !== tempIdx);
        }
      }
      if (filtered.some((message) => message.id === incoming.id || message._id === incoming._id)) return filtered;
      return [...filtered, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  };

  const loadWorkspace = async (preferredChannelId?: string, silent = false) => {
    if (!roomId) return;
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
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
    setPendingCommand(null);
    setShowInterviewNotes(false);
    setInterviewNotesDraft(selectedChannel?.interviewNotes ?? "");
    setShowMeetLinkForm(false);
    setMeetLinkDraft("");
    setShowOfferForm(false);
    setOfferCandidateId("");
  }, [selectedChannelId, selectedChannel?.interviewNotes]);

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
    socket.on("room:channel_created", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:participant_joined", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:participant_invited", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:participant_removed", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:document_permission_updated", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:status_changed", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:nda_signed", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:milestone_updated", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:milestone_released", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:interview_created", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:interview_updated", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:hire_offer_sent", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:hire_offer_accepted", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:hire_offer_declined", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:hire_offer_changes_requested", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:hire_offer_contracted", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:command_executed", () => void loadWorkspace(selectedChannelId, true));
    socket.on("room:deleted", () => {
      toast.info("This room was deleted");
      navigate(user.role === "business" ? "/business/dashboard" : "/talent/dashboard");
    });
    return () => {
      socket.disconnect();
    };
  }, [roomId, user?._id, user?.role, selectedChannelId, navigate]);

  const previewCommand = async (commandText: string) => {
    if (!roomId || !selectedChannelId || commandLoading) return;
    setCommandLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/commands/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ channelId: selectedChannelId, commandText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ambiguous = Array.isArray(data.ambiguous) && data.ambiguous.length > 0
          ? ` Try a more specific name: ${data.ambiguous.flatMap((item: any) => item.candidates?.map((candidate: any) => candidate.name) ?? []).join(", ")}`
          : "";
        throw new Error(`${data.error ?? "Command failed"}${ambiguous}`);
      }
      setPendingCommand(data);
      setMessageInput("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to preview command");
    } finally {
      setCommandLoading(false);
    }
  };

  const executeCommand = async () => {
    if (!pendingCommand || commandLoading) return;
    if (!pendingCommand.requiresConfirmation) {
      setPendingCommand(null);
      return;
    }
    if (pendingCommand.action === "meet" && !pendingCommand.payload?.meetLink) {
      setPendingCommand(null);
      await createMeet();
      return;
    }
    setCommandLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/commands/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          commandId: pendingCommand.commandId,
          action: pendingCommand.action,
          payload: pendingCommand.payload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Command execution failed");
      if (data.message) mergeMessage(data.message);
      if (data.channel?._id) {
        await loadWorkspace(data.channel._id, true);
      } else {
        await loadWorkspace(selectedChannelId, true);
      }
      toast.success("Command executed");
      setPendingCommand(null);
    } catch (err: any) {
      toast.error(err.message ?? "Command execution failed");
    } finally {
      setCommandLoading(false);
    }
  };

  const runParticipantCommand = (action: "interview" | "hire" | "remove", participant: any) => {
    const person = participant.user ?? participant.userId;
    const name = person?.name ?? participant.name ?? "Talent";
    void previewCommand(`/${action} @${name}`);
  };

  const insertMention = (participant: any) => {
    const person = participant.user ?? participant.userId;
    const name = person?.name ?? participant.name ?? "Talent";
    const next = messageInput.replace(/@([^@\n]*)$/, `@${name} `);
    setMessageInput(next);
  };

  const createMeet = async () => {
    if (!selectedChannel || selectedChannel.type !== "interview" || commandLoading) return;
    if (selectedChannel.interviewMeetLink) {
      window.open(selectedChannel.interviewMeetLink, "_blank", "noopener,noreferrer");
      return;
    }
    if (!isOwner) {
      toast.error("Meet link is not ready yet");
      return;
    }
    window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
    setShowMeetLinkForm(true);
  };

  const shareMeetLink = async () => {
    if (!selectedChannel || selectedChannel.type !== "interview" || commandLoading) return;
    const meetLink = meetLinkDraft.trim();
    if (!meetLink) {
      toast.error("Paste the Google Meet link first");
      return;
    }
    setCommandLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/interviews/${selectedChannel._id}/meet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ meetLink }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to share Meet link");
      if (data.message) mergeMessage(data.message);
      setShowMeetLinkForm(false);
      setMeetLinkDraft("");
      await loadWorkspace(selectedChannel._id, true);
      toast.success("Meet link shared");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to share Meet link");
    } finally {
      setCommandLoading(false);
    }
  };

  const updateInterview = async (payload: Record<string, unknown>) => {
    if (!selectedChannel || selectedChannel.type !== "interview" || interviewSaving) return;
    setInterviewSaving(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/interviews/${selectedChannel._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update interview");
      await loadWorkspace(selectedChannel._id, true);
      toast.success("Interview updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update interview");
    } finally {
      setInterviewSaving(false);
    }
  };

  const participantRole = (participant: any) => {
    return workspace?.roles.find((role) => String(role._id) === String(participant?.roleId ?? selectedChannel?.roleId)) ?? null;
  };

  const canSendOfferToParticipant = (participant: any) => {
    if (!selectedChannel || selectedChannel.type !== "interview" || selectedChannel.interviewStatus !== "completed") return false;
    return selectedChannelParticipants.some((item: any) => String(item._id) === String(participant._id));
  };

  const openOfferForm = (participant?: any) => {
    if (!selectedChannel || selectedChannel.type !== "interview") {
      toast.error("Select an interview channel first");
      return;
    }
    if (selectedChannel.interviewStatus !== "completed") {
      toast.error("Mark the interview complete before sending an offer");
      return;
    }
    const target = participant ?? selectedChannelParticipants[0];
    if (!target) {
      toast.error("No interview participant selected");
      return;
    }
    const person = target.user ?? target.userId;
    const role = participantRole(target);
    setOfferCandidateId(String(person?._id ?? target.talentId ?? target.userId));
    setOfferDraft({
      amountUsd: "",
      rateType: "fixed",
      rateAmountUsd: "",
      startDate: "",
      expectedEndDate: "",
      scopeSummary: `Offer for ${role?.roleTitle ?? "project role"} in ${room?.title ?? "this Live Room"}.`,
      terms: "Milestone releases are simulated in DEHIX until a real payment gateway is connected. Final IP transfers after accepted milestone release.",
      milestonePlanText: "",
    });
    setShowOfferForm(true);
  };

  const parseMilestonePlanText = () => {
    return offerDraft.milestonePlanText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, amount, dueDate, ...descriptionParts] = line.split("|").map((part) => part.trim());
        return {
          title,
          amountUsd: amount ? Number(amount.replace(/[^0-9.]/g, "")) || undefined : undefined,
          dueDate: dueDate || undefined,
          description: descriptionParts.join(" | ") || undefined,
        };
      })
      .filter((milestone) => milestone.title);
  };

  const sendHireOffer = async () => {
    if (!selectedChannel || selectedChannel.type !== "interview" || !offerCandidate || offerSubmitting) return;
    const person = offerCandidate.user ?? offerCandidate.userId;
    const freelancerId = String(person?._id ?? offerCandidate.talentId ?? offerCandidate.userId);
    const role = participantRole(offerCandidate);
    if (!role?._id) {
      toast.error("Selected talent does not have a role in this room");
      return;
    }
    if (!offerDraft.scopeSummary.trim() || !offerDraft.terms.trim()) {
      toast.error("Scope summary and terms are required");
      return;
    }
    setOfferSubmitting(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          freelancerId,
          roleId: role._id,
          interviewChannelId: selectedChannel._id,
          amountUsd: offerDraft.amountUsd ? Number(offerDraft.amountUsd) : undefined,
          rateType: offerDraft.rateType,
          rateAmountUsd: offerDraft.rateAmountUsd ? Number(offerDraft.rateAmountUsd) : undefined,
          startDate: offerDraft.startDate || undefined,
          expectedEndDate: offerDraft.expectedEndDate || undefined,
          scopeSummary: offerDraft.scopeSummary,
          terms: offerDraft.terms,
          milestonePlan: parseMilestonePlanText(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send offer");
      toast.success("Hire offer sent");
      setShowOfferForm(false);
      await loadWorkspace(selectedChannel._id, true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send offer");
    } finally {
      setOfferSubmitting(false);
    }
  };

  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!text || !roomId || !selectedChannelId || sending) return;

    if (text.startsWith("/")) {
      await previewCommand(text);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: RoomMessage = {
      _id: tempId,
      id: tempId,
      channelId: selectedChannelId,
      senderId: user?._id ?? "temp-user",
      senderName: user?.name ?? "You",
      type: "user",
      message: text,
      mentions: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);

    setSending(true);
    setLastSentText(text);
    setMessageInput("");

    try {
      const res = await fetch(`/api/rooms/${roomId}/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send message");

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempId);
        let next = filtered;
        if (data.message && !next.some((m) => m.id === data.message.id || m._id === data.message._id)) {
          next = [...next, data.message];
        }
        if (data.aiMessage && !next.some((m) => m.id === data.aiMessage.id || m._id === data.aiMessage._id)) {
          next = [...next, data.aiMessage];
        }
        return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
    
    // Optimistic UI Update
    setWorkspace((prev) => {
      if (!prev) return prev;
      const updatedMatrix = prev.permissionMatrix.map(t => {
        if (t.participantId === talent.participantId) {
          return {
            ...t,
            documents: t.documents.map(d => {
              if (d.docType === doc.docType) {
                return { ...d, canView: !d.canView };
              }
              return d;
            })
          };
        }
        return t;
      });
      return { ...prev, permissionMatrix: updatedMatrix };
    });

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
      // Background sync, no need to await loadWorkspace if we optimistically updated unless we want to ensure sync
      void loadWorkspace(selectedChannelId, false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update permission");
      // Revert optimistic update on failure by reloading workspace
      await loadWorkspace(selectedChannelId, true);
    } finally {
      setPermissionSaving(null);
    }
  };

  const grantFullAccessToParticipant = async (talent: PermissionTalent) => {
    const promises = talent.documents
      .filter((doc) => !doc.canView)
      .map((doc) => {
        return fetch(`/api/rooms/${roomId}/document-permissions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            participantId: talent.participantId,
            docType: doc.docType,
            canView: true,
          }),
        });
      });

    if (promises.length === 0) {
      toast.info(`All access already granted for ${talent.name}`);
      return;
    }

    try {
      toast.loading("Granting full access...", { id: "grant-permissions" });
      const results = await Promise.all(promises);
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error("Some permissions failed to update");
      toast.success(`Granted full access for ${talent.name}`, { id: "grant-permissions" });
      await loadWorkspace(selectedChannelId, true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to grant access", { id: "grant-permissions" });
    }
  };

  const revokeAllAccessForParticipant = async (talent: PermissionTalent) => {
    const promises = talent.documents
      .filter((doc) => doc.canView)
      .map((doc) => {
        return fetch(`/api/rooms/${roomId}/document-permissions`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            participantId: talent.participantId,
            docType: doc.docType,
            canView: false,
          }),
        });
      });

    if (promises.length === 0) {
      toast.info(`All access already revoked for ${talent.name}`);
      return;
    }

    try {
      toast.loading("Revoking all access...", { id: "revoke-permissions" });
      const results = await Promise.all(promises);
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error("Some permissions failed to update");
      toast.success(`Revoked all access for ${talent.name}`, { id: "revoke-permissions" });
      await loadWorkspace(selectedChannelId, true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to revoke access", { id: "revoke-permissions" });
    }
  };

  const grantFullAccessToAll = async () => {
    const promises: Promise<any>[] = [];
    workspace?.permissionMatrix.forEach((talent) => {
      talent.documents.forEach((doc) => {
        if (!doc.canView) {
          promises.push(
            fetch(`/api/rooms/${roomId}/document-permissions`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                participantId: talent.participantId,
                docType: doc.docType,
                canView: true,
              }),
            })
          );
        }
      });
    });

    if (promises.length === 0) {
      toast.info("All participants already have full access");
      return;
    }

    try {
      toast.loading("Granting full access to all...", { id: "grant-all" });
      const results = await Promise.all(promises);
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error("Some permissions failed to update");
      toast.success("Granted full access to all participants", { id: "grant-all" });
      await loadWorkspace(selectedChannelId, true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to grant access to all", { id: "grant-all" });
    }
  };

  const revokeFullAccessFromAll = async () => {
    const promises: Promise<any>[] = [];
    workspace?.permissionMatrix.forEach((talent) => {
      talent.documents.forEach((doc) => {
        if (doc.canView) {
          promises.push(
            fetch(`/api/rooms/${roomId}/document-permissions`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({
                participantId: talent.participantId,
                docType: doc.docType,
                canView: false,
              }),
            })
          );
        }
      });
    });

    if (promises.length === 0) {
      toast.info("All participants already have no document access");
      return;
    }

    try {
      toast.loading("Revoking all access...", { id: "revoke-all" });
      const results = await Promise.all(promises);
      const failed = results.find((r) => !r.ok);
      if (failed) throw new Error("Some permissions failed to update");
      toast.success("Revoked all document access for all participants", { id: "revoke-all" });
      await loadWorkspace(selectedChannelId, true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to revoke access from all", { id: "revoke-all" });
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
        {/* Left Side Panel - Primary Narrow Sidebar (70px) */}
        <aside className="w-[70px] shrink-0 border-r border-border/40 bg-card/60 flex flex-col items-center py-4 justify-between">
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Top Logo / App Icon */}
            <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary font-bold text-lg mb-2">
              D
            </div>

            {/* Channels / Chat Tab */}
            <button
              onClick={() => setActiveTab("channels")}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                activeTab === "channels"
                  ? "bg-primary text-primary-foreground shadow-md scale-105"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              title="Channels & Chat"
            >
              <MessageSquare className="h-5 w-5" />
            </button>

            {/* Roles & Tasks Tab */}
            <button
              onClick={() => setActiveTab("roles")}
              className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                activeTab === "roles"
                  ? "bg-primary text-primary-foreground shadow-md scale-105"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              title="Roles & Tasks"
            >
              <Briefcase className="h-5 w-5" />
            </button>


          </div>

          {/* Bottom Actions */}
          <div className="w-full px-2">
            <button
              onClick={() => navigate(user.role === "business" ? "/business/dashboard" : "/talent/dashboard")}
              className="h-10 w-full rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
              title="Exit Workspace"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
        </aside>

        {/* Left Side Panel - Secondary Sidebar (280px) */}
        <aside className="w-[280px] shrink-0 border-r border-border/40 bg-card/30 flex flex-col">
          {/* Header of Secondary Sidebar */}
          <div className="h-14 px-4 border-b border-border/40 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{room.title}</div>
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {room.roomCode} · {room.status}
              </div>
            </div>
            <button
              onClick={() => void loadWorkspace(selectedChannelId, true)}
              className="h-8 w-8 rounded-md hover:bg-muted/70 inline-flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              title="Refresh Workspace"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Dynamic Content based on activeTab */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "channels" && (
              <div className="space-y-4">
                {/* Standard Channels Group */}
                <div>
                  <PanelHeader icon={<Users className="h-3.5 w-3.5" />} label="Channels" count={regularChannels.length} />
                  <div className="space-y-1 mt-1.5">
                    {regularChannels.map((channel) => (
                      <button
                        key={channel._id}
                        onClick={() => setSelectedChannelId(channel._id)}
                        className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-all ${
                          selectedChannelId === channel._id
                            ? "bg-primary/12 text-primary border border-primary/20 shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent"
                        }`}
                      >
                        {channel.name === "ai-agent" ? <Bot className="h-3.5 w-3.5 text-primary" /> : <Hash className="h-3.5 w-3.5" />}
                        <span className="truncate font-semibold">{channel.displayName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interview Channels Group */}
                {interviewChannels.length > 0 && (
                  <div>
                    <PanelHeader icon={<Calendar className="h-3.5 w-3.5" />} label="Interviews" count={interviewChannels.length} />
                    <div className="space-y-1 mt-1.5">
                      {interviewChannels.map((channel) => (
                        <button
                          key={channel._id}
                          onClick={() => setSelectedChannelId(channel._id)}
                          className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-all ${
                            selectedChannelId === channel._id
                              ? "bg-primary/12 text-primary border border-primary/20 shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent"
                          }`}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="truncate font-semibold">{channel.displayName}</span>
                          <span className="ml-auto rounded border border-border/35 px-1.5 py-0.5 text-[9px] capitalize opacity-75">
                            {channel.interviewStatus ?? "scheduled"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Messages Group */}
                <div>
                  <PanelHeader icon={<User className="h-3.5 w-3.5" />} label="Direct Messages" count={directChannels.length} />
                  <div className="space-y-1 mt-1.5">
                    {directChannels.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground/50 italic px-2 py-1">No direct messages</div>
                    ) : (
                      directChannels.map((channel) => (
                        <button
                          key={channel._id}
                          onClick={() => setSelectedChannelId(channel._id)}
                          className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-all ${
                            selectedChannelId === channel._id
                              ? "bg-primary/12 text-primary border border-primary/20 shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/45 border border-transparent"
                          }`}
                        >
                          <User className="h-3.5 w-3.5 text-muted-foreground/80" />
                          <span className="truncate font-semibold">{channel.displayName}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "roles" && (
              <div className="space-y-4">
                <PanelHeader icon={<Briefcase className="h-3.5 w-3.5" />} label="Roles and Tasks" count={workspace.roles.length} />
                <div className="space-y-2 mt-1.5">
                  {workspace.roles.map((role) => {
                    const roleTickets = workspace.tickets.filter((ticket) => String(ticket.assignedRole ?? "") === String(role._id));
                    return (
                      <div key={role._id} className="rounded-md border border-border/40 bg-background/45 p-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold truncate">{role.roleTitle}</div>
                          <span className="text-[9px] rounded border border-border/45 px-1.5 py-0.5 text-muted-foreground uppercase">{role.status}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate mt-1">{role.skillDomain}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{roleTickets.length} assigned ticket{roleTickets.length === 1 ? "" : "s"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col bg-white dark:bg-card border border-border/40 rounded-[24px] my-3 mx-2 shadow-sm overflow-hidden">
            <header className="h-16 shrink-0 border-b border-border/30 px-5 flex items-center justify-between gap-3 bg-background/75 relative z-10">
              <div className="flex items-center gap-3.5 min-w-0">
                {selectedChannel?.name === "ai-agent" ? (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                ) : selectedChannel?.type === "general" ? (
                  <div className="w-8 h-8 rounded-lg bg-secondary/60 border border-border/20 flex items-center justify-center text-muted-foreground shrink-0">
                    <Hash className="h-4 w-4" />
                  </div>
                ) : selectedChannel?.type === "interview" ? (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Calendar className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-secondary/60 border border-border/20 flex items-center justify-center text-muted-foreground shrink-0">
                    <Lock className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold truncate text-foreground">{selectedChannel?.displayName ?? "Channel"}</div>
                    {selectedChannel?.type === "interview" && (
                      <span className={`inline-flex items-center text-[9px] font-bold rounded-md px-1.5 py-0.5 border uppercase tracking-wider ${
                        selectedChannel.interviewStatus === "completed"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                          : selectedChannel.interviewStatus === "live"
                            ? "border-green-500/20 bg-green-500/10 text-green-500 animate-pulse"
                            : "border-primary/20 bg-primary/10 text-primary"
                      }`}>
                        {selectedChannel.interviewStatus ?? "scheduled"}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                    {selectedChannel?.name === "ai-agent"
                      ? "Dedicated AI Assistant. Type your queries directly; no need to use @dehixai."
                      : selectedChannel?.type === "general"
                        ? "General chat. Mention @dehixai when you want AI to participate."
                        : selectedChannel?.type === "interview"
                          ? "Collaborative workspace for conducting technical interviews."
                          : "Private business-talent conversation."}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                {selectedChannel?.type === "interview" ? (
                  <div className="flex items-center gap-1.5">
                    {selectedChannel.interviewMeetLink && (
                      <a
                        href={selectedChannel.interviewMeetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-xs"
                      >
                        <Video className="h-3.5 w-3.5" /> Join Meet
                      </a>
                    )}
                    {isOwner && !selectedChannel.interviewMeetLink && (
                      <Button size="sm" variant="outline" onClick={() => void createMeet()} disabled={commandLoading} className="h-8 text-xs font-semibold gap-1">
                        <Video className="h-3.5 w-3.5" /> Create Meet
                      </Button>
                    )}
                    {isOwner && (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setShowInterviewNotes((value) => !value)} 
                          className={`h-8 text-xs font-semibold gap-1 ${
                            showInterviewNotes ? "bg-primary/5 border-primary text-primary" : ""
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" /> Notes
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => void updateInterview({ status: "completed" })} 
                          disabled={interviewSaving || selectedChannel.interviewStatus === "completed"} 
                          className="h-8 text-xs font-semibold gap-1"
                        >
                          <Check className="h-3.5 w-3.5" /> Mark Complete
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openOfferForm()}
                          disabled={selectedChannel.interviewStatus !== "completed" || selectedChannelParticipants.length === 0}
                          className="h-8 text-xs font-bold gap-1"
                        >
                          <Briefcase className="h-3.5 w-3.5" /> Send Offer
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Permission-aware AI
                  </div>
                )}
                <button
                  onClick={() => setRightPanelVisible(!rightPanelVisible)}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/25 cursor-pointer shrink-0"
                  title={rightPanelVisible ? "Hide details panel" : "Show details panel"}
                >
                  {rightPanelVisible ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9v10.5A2.25 2.25 0 0010.5 22h6a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0016.5 3h-6a2.25 2.25 0 00-2.25 2.25V9m13.5-3L21 9m0 0l-3 3m3-3H8.25" />
                    </svg>
                  )}
                </button>
              </div>
            </header>

            {selectedChannel?.type === "interview" && isOwner && showMeetLinkForm && !selectedChannel.interviewMeetLink && (
              <div className="shrink-0 border-b border-border/40 bg-card/35 px-5 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={meetLinkDraft}
                    onChange={(event) => setMeetLinkDraft(event.target.value)}
                    placeholder="https://meet.google.com/xxx-yyyy-zzz"
                    className="h-9 min-w-0 flex-1 rounded-md border border-border/45 bg-background/70 px-3 text-xs text-foreground outline-none focus:border-primary/40"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer")}
                      className="h-9 text-xs"
                    >
                      <Video className="h-3.5 w-3.5 mr-1" /> Open Meet
                    </Button>
                    <Button size="sm" onClick={() => void shareMeetLink()} disabled={commandLoading} className="h-9 text-xs">
                      Share
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowMeetLinkForm(false);
                        setMeetLinkDraft("");
                      }}
                      className="h-9 px-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Notes editor drawer for interview channel */}
            {selectedChannel?.type === "interview" && showInterviewNotes && isOwner && (
              <div className="shrink-0 border-b border-border/40 bg-card/35 px-5 py-3">
                <div className="flex items-start gap-2">
                  <textarea
                    value={interviewNotesDraft}
                    onChange={(event) => setInterviewNotesDraft(event.target.value)}
                    rows={3}
                    placeholder="Private interview notes for the business..."
                    className="min-h-20 flex-1 resize-none rounded-lg border border-border/45 bg-background/70 px-3 py-2 text-xs outline-none focus:border-primary/40 text-foreground"
                  />
                  <Button
                    size="sm"
                    onClick={() => void updateInterview({ interviewNotes: interviewNotesDraft })}
                    disabled={interviewSaving}
                    className="h-9 text-xs"
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {selectedChannel?.type === "interview" && showOfferForm && isOwner && (
              <div className="shrink-0 border-b border-border/40 bg-card/40 px-5 py-4">
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">Send hire offer</div>
                      <div className="text-[11px] text-muted-foreground">Offer becomes active only after freelancer accepts and both parties sign.</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setShowOfferForm(false)} className="h-8 px-2">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Freelancer</span>
                      <select
                        value={offerCandidateId}
                        onChange={(event) => setOfferCandidateId(event.target.value)}
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      >
                        {selectedChannelParticipants.map((participant: any) => {
                          const person = participant.user ?? participant.userId;
                          const value = String(person?._id ?? participant.talentId ?? participant.userId);
                          return <option key={participant._id} value={value}>{person?.name ?? participant.name ?? "Talent"}</option>;
                        })}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Total amount</span>
                      <input
                        value={offerDraft.amountUsd}
                        onChange={(event) => setOfferDraft((prev) => ({ ...prev, amountUsd: event.target.value }))}
                        placeholder="5000"
                        inputMode="decimal"
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Rate type</span>
                      <select
                        value={offerDraft.rateType}
                        onChange={(event) => setOfferDraft((prev) => ({ ...prev, rateType: event.target.value }))}
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="hourly">Hourly</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Rate amount</span>
                      <input
                        value={offerDraft.rateAmountUsd}
                        onChange={(event) => setOfferDraft((prev) => ({ ...prev, rateAmountUsd: event.target.value }))}
                        placeholder="Optional"
                        inputMode="decimal"
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Start date</span>
                      <input
                        type="date"
                        value={offerDraft.startDate}
                        onChange={(event) => setOfferDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Expected end</span>
                      <input
                        type="date"
                        value={offerDraft.expectedEndDate}
                        onChange={(event) => setOfferDraft((prev) => ({ ...prev, expectedEndDate: event.target.value }))}
                        className="h-9 w-full rounded-md border border-border/45 bg-background/70 px-2 text-xs outline-none focus:border-primary/40"
                      />
                    </label>
                  </div>

                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Scope summary</span>
                    <textarea
                      rows={3}
                      value={offerDraft.scopeSummary}
                      onChange={(event) => setOfferDraft((prev) => ({ ...prev, scopeSummary: event.target.value }))}
                      className="w-full resize-none rounded-md border border-border/45 bg-background/70 px-3 py-2 text-xs outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Terms</span>
                    <textarea
                      rows={3}
                      value={offerDraft.terms}
                      onChange={(event) => setOfferDraft((prev) => ({ ...prev, terms: event.target.value }))}
                      className="w-full resize-none rounded-md border border-border/45 bg-background/70 px-3 py-2 text-xs outline-none focus:border-primary/40"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Milestone plan</span>
                    <textarea
                      rows={3}
                      value={offerDraft.milestonePlanText}
                      onChange={(event) => setOfferDraft((prev) => ({ ...prev, milestonePlanText: event.target.value }))}
                      placeholder="One per line: Title | Amount | YYYY-MM-DD | Description"
                      className="w-full resize-none rounded-md border border-border/45 bg-background/70 px-3 py-2 text-xs outline-none focus:border-primary/40"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowOfferForm(false)} disabled={offerSubmitting}>Cancel</Button>
                    <Button size="sm" onClick={() => void sendHireOffer()} disabled={offerSubmitting}>
                      {offerSubmitting ? "Sending..." : "Send Offer"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMessages ? (
                <div className="text-sm text-muted-foreground animate-pulse">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-6 animate-fadeIn">
                  {/* Premium Glowing Bot Badge */}
                  <div className="relative flex items-center justify-center">
                    <div className="absolute -inset-2 bg-primary/10 rounded-full blur-xl animate-pulse" />
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary/15 via-primary/5 to-transparent border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5 relative z-10">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      {selectedChannel?.name === "ai-agent" ? "Welcome to your AI Agent Chat" : "Welcome to the Workspace Chat"}
                    </h3>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed">
                      {selectedChannel?.name === "ai-agent"
                        ? "Ask anything about the project validation, blueprints, features, roadmap, and technologies. The AI will assist you instantly."
                        : "Start a conversation with your team or call @dehixai for permission-aware AI assistance with project tasks, contracts, or milestones."}
                    </p>
                  </div>
                  
                  <div className="w-full space-y-2 pt-2">
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center">Suggested Prompt Actions</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { label: "Analyze project scope", text: selectedChannel?.name === "ai-agent" ? "what is the core scope of this project?" : "@dehixai what is the core scope of this project?" },
                        { label: "Check required documents", text: selectedChannel?.name === "ai-agent" ? "which documents are pending for my role?" : "@dehixai which documents are pending for my role?" },
                        { label: "Generate team milestones", text: selectedChannel?.name === "ai-agent" ? "can you outline the main milestones for our roles?" : "@dehixai can you outline the main milestones for our roles?" }
                      ].map((chip, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setMessageInput(chip.text);
                          }}
                          className="text-left text-xs font-semibold rounded-2xl border border-border/30 bg-card/45 hover:bg-primary/5 hover:border-primary/30 text-muted-foreground hover:text-foreground px-4 py-2.5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 animate-in fade-in duration-200"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <MessageBubble key={message.id} message={message} isMine={message.senderId === user._id} />
                ))
              )}
              
              {/* AI thinking loader animation */}
              {sending && (lastSentText.toLowerCase().includes("@dehixai") || selectedChannel?.name === "ai-agent") && (
                <div className="flex gap-3 my-4 flex-row animate-pulse">
                  <div className="shrink-0 self-end mb-1">
                    <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex flex-col items-start max-w-[74%]">
                    <div className="flex items-center gap-2 mb-1 px-1.5">
                      <span className="text-[13px] font-[800] uppercase tracking-widest text-foreground/80">DEHIX AI</span>
                      <span className="text-[11px] font-[400] text-[#6B7280]">thinking...</span>
                    </div>
                    <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm border border-border/40 bg-card text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-border/40 p-4 bg-background/80">
              {pendingCommand && (
                <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3 animate-fadeIn">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-primary">/{pendingCommand.action}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-foreground">{pendingCommand.summary}</div>
                      {pendingCommand.targets.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {pendingCommand.targets.map((target) => (
                            <span key={target.participantId} className="rounded-full border border-border/40 bg-background/60 px-2 py-1 text-[10px] font-bold text-muted-foreground">
                              {target.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {pendingCommand.warnings && pendingCommand.warnings.length > 0 && (
                        <div className="mt-2 text-[11px] text-amber-500">{pendingCommand.warnings.join(" ")}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPendingCommand(null)} disabled={commandLoading} className="h-8 text-xs">
                        {pendingCommand.requiresConfirmation ? "Cancel" : "Close"}
                      </Button>
                      {pendingCommand.requiresConfirmation && (
                        <Button size="sm" onClick={() => void executeCommand()} disabled={commandLoading} className="h-8 text-xs">
                          {commandLoading ? "Running..." : "Confirm"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {messageInput.startsWith("/") && !pendingCommand && (
                <div className="mb-2 flex flex-wrap gap-1.5 rounded-lg border border-border/40 bg-card/45 p-2 animate-fadeIn">
                  {commandSuggestions.map((item) => (
                    <button
                      key={item.command}
                      onClick={() => setMessageInput(item.command)}
                      className="rounded-md border border-border/35 bg-background/50 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      {item.command} <span className="font-normal opacity-70">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {mentionSuggestions.length > 0 && !pendingCommand && (
                <div className="mb-2 flex flex-wrap gap-1.5 rounded-lg border border-border/40 bg-card/45 p-2 animate-fadeIn">
                  {mentionSuggestions.map((participant: any) => {
                    const person = participant.user ?? participant.userId;
                    return (
                      <button
                        key={participant._id}
                        onClick={() => insertMention(participant)}
                        className="rounded-md border border-border/35 bg-background/50 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        @{person?.name ?? participant.name ?? "Talent"}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="rounded-2xl border border-[#E5E7EB] dark:border-border/40 bg-card p-2.5 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/45 transition-all duration-200">
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
                  placeholder={
                    selectedChannel?.name === "ai-agent"
                      ? "Ask the AI Agent anything..."
                      : isOwner
                        ? `Message ${selectedChannel?.displayName ?? "channel"}... /help for commands`
                        : `Message ${selectedChannel?.displayName ?? "channel"}...`
                  }
                  className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/45 text-foreground"
                />
                <div className="flex items-center justify-between gap-3 px-1 mt-2 pt-2 border-t border-border/10">
                  <div className="flex items-center gap-2">
                    {selectedChannel?.name !== "ai-agent" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!messageInput.includes("@dehixai")) {
                            setMessageInput((prev) => "@dehixai " + prev);
                          }
                        }}
                        className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer shrink-0"
                        title="Ask AI"
                      >
                        <Bot className="h-3 w-3" /> Mention @dehixai
                      </button>
                    )}
                    <span className="text-[10px] font-[500] text-[#9CA3AF] hidden sm:inline">
                      {isOwner
                        ? "Use @dehixai for AI, @name to notify talent, or / commands."
                        : "Use @dehixai for AI or @name mentions in conversations."}
                    </span>
                  </div>
                  <Button 
                    onClick={() => void sendMessage()} 
                    disabled={!messageInput.trim() || sending} 
                    className="h-8 px-4 text-xs font-bold bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 rounded-lg disabled:opacity-50 transition-all shadow hover:shadow-md cursor-pointer border border-transparent"
                  >
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

        {/* Right Side Panel - Participants & Documents (300px) */}
        {rightPanelVisible && (
          <aside className="w-[300px] shrink-0 border-l border-border/40 bg-card/30 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="h-14 px-4 border-b border-border/40 flex items-center justify-between shrink-0 bg-background/75">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                Workspace Details
              </div>
              <button
                onClick={() => setRightPanelVisible(false)}
                className="h-8 w-8 rounded-md hover:bg-muted/70 inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Hide details panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable content inside panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Participants Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary/80" />
                    Participants
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] lowercase">{workspace.participants.length} Total</span>
                </div>

                {/* Joined Sub-section */}
                <div className="space-y-2 animate-fadeIn">
                  <div className="text-[10px] font-bold text-muted-foreground/70 tracking-wider uppercase pl-0.5">Joined</div>
                  {workspace.participants.filter(p => p.status === "joined" || p.status === "accepted").length === 0 ? (
                    <div className="text-[10px] text-muted-foreground/50 italic px-1">No participants joined yet</div>
                  ) : (
                    workspace.participants
                      .filter(p => p.status === "joined" || p.status === "accepted")
                      .map((participant: any) => {
                        const person = participant.user ?? participant.userId;
                        const role = workspace.roles.find((item) => String(item._id) === String(participant.roleId));
                        const talentMatrix = workspace.permissionMatrix.find(t => String(t.participantId) === String(participant._id));
                        const totalDocs = talentMatrix?.documents.length ?? 0;
                        const grantedViewCount = talentMatrix?.documents.filter(d => d.canView).length ?? 0;
                        
                        return (
                          <div key={participant._id} className="rounded-xl border border-border/40 bg-background/45 p-2.5 shadow-sm hover:bg-background/80 hover:border-border/60 transition-all duration-200">
                            <div className="flex items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {/* Initials Avatar with Green Active Dot */}
                                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0 relative shadow-sm">
                                  {person?.name?.[0]?.toUpperCase() ?? "T"}
                                  <span className="absolute bottom-[-1.5px] right-[-1.5px] h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-sm animate-pulse"></span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold truncate text-foreground">{person?.name ?? "Talent"}</div>
                                  {role?.roleTitle && (
                                    <div className="text-[10px] text-muted-foreground truncate leading-none mt-1">{role.roleTitle}</div>
                                  )}
                                </div>
                              </div>
                              {isOwner && (
                                <button
                                  onClick={() => runParticipantCommand("remove", participant)}
                                  className="h-8 w-8 rounded-lg border border-border text-foreground hover:bg-muted/50 inline-flex items-center justify-center cursor-pointer transition-all shrink-0"
                                  title="Remove talent"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            
                            {/* Command action buttons for room owner */}
                            {isOwner && (
                              <div className="mt-2.5 flex items-center gap-1 border-t border-border/20 pt-2 animate-fadeIn flex-wrap">
                                <button
                                  onClick={() => runParticipantCommand("interview", participant)}
                                  disabled={!["joined", "accepted"].includes(participant.status)}
                                  className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-all disabled:opacity-40 disabled:pointer-events-none"
                                  title="Create interview"
                                >
                                  Interview
                                </button>
                                <button
                                  onClick={() => openOfferForm(participant)}
                                  disabled={!canSendOfferToParticipant(participant)}
                                  className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-all disabled:opacity-40 disabled:pointer-events-none"
                                  title="Send offer after completed interview"
                                >
                                  Offer
                                </button>
                                <button
                                  onClick={() => setExpandedPermissions((prev) => ({ ...prev, [participant._id]: !prev[participant._id] }))}
                                  className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-all ${
                                    expandedPermissions[participant._id]
                                      ? "border-foreground bg-foreground text-background dark:border-foreground dark:bg-foreground dark:text-background"
                                      : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                  }`}
                                  title="Manage Document Access Control"
                                >
                                  Access {talentMatrix ? `(${grantedViewCount}/${totalDocs})` : ""}
                                </button>
                              </div>
                            )}

                            {/* Collapsible Document Access Matrix inside Card */}
                            {isOwner && expandedPermissions[participant._id] && talentMatrix && (
                              <div className="mt-2.5 border-t border-border/20 pt-2 space-y-2 animate-fadeIn">
                                <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-0.5">
                                  <span>Document Access</span>
                                  <div className="flex gap-1.5">
                                    <button 
                                      onClick={() => void grantFullAccessToParticipant(talentMatrix)} 
                                      className="text-primary hover:underline cursor-pointer"
                                    >
                                      Grant All
                                    </button>
                                    <span>·</span>
                                    <button 
                                      onClick={() => void revokeAllAccessForParticipant(talentMatrix)} 
                                      className="text-destructive hover:underline cursor-pointer"
                                    >
                                      Revoke All
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  {talentMatrix.documents.map((doc) => {
                                    const permissionKey = `${talentMatrix.participantId}:${doc.docType}`;
                                    return (
                                      <div key={doc.docType} className="flex items-center justify-between text-[10px] p-1.5 rounded-lg bg-background/50 border border-border/10">
                                        <div className="flex items-center gap-1.5 min-w-0 mr-2">
                                          <FileText className="h-3 w-3 text-muted-foreground/75 shrink-0" />
                                          <span className="truncate text-foreground/80 font-medium" title={doc.title}>{doc.title}</span>
                                        </div>
                                        <button
                                          onClick={() => void togglePermission(talentMatrix, doc)}
                                          disabled={permissionSaving === permissionKey}
                                          className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 shrink-0 relative cursor-pointer ${
                                            doc.canView ? "bg-primary" : "bg-muted-foreground/30"
                                          }`}
                                        >
                                          <div
                                            className={`bg-white w-3 h-3 rounded-full shadow-sm transform transition-transform duration-200 ${
                                              doc.canView ? "translate-x-3" : "translate-x-0"
                                            }`}
                                          />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Invited/Pending Collapsible Dropdown */}
                <div className="space-y-2 pt-2 animate-fadeIn border-t border-border/10">
                  <button
                    onClick={() => setInvitedOpen(!invitedOpen)}
                    className="w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground/70 tracking-wider uppercase pl-0.5 py-1.5 hover:text-foreground transition-all"
                  >
                    <span>
                      Invited / Pending ({workspace.participants.filter(p => p.status !== "joined" && p.status !== "accepted").length})
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                      invitedOpen ? "rotate-180" : ""
                    }`} />
                  </button>

                  {invitedOpen && (
                    <div className="space-y-2 animate-fadeIn mt-1">
                      {workspace.participants.filter(p => p.status !== "joined" && p.status !== "accepted").length === 0 ? (
                        <div className="text-[10px] text-muted-foreground/50 italic px-1 py-1">No pending invitations</div>
                      ) : (
                        workspace.participants
                          .filter(p => p.status !== "joined" && p.status !== "accepted")
                          .map((participant: any) => {
                            const person = participant.user ?? participant.userId;
                            const role = workspace.roles.find((item) => String(item._id) === String(participant.roleId));
                            return (
                              <div key={participant._id} className="rounded-xl border border-border/40 bg-background/45 p-2.5 shadow-sm hover:bg-background/80 hover:border-border/60 transition-all duration-200">
                                <div className="flex items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    {/* Initials Avatar with Orange Pending Dot */}
                                    <div className="h-9 w-9 rounded-xl bg-muted border border-border flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 relative shadow-sm">
                                      {person?.name?.[0]?.toUpperCase() ?? "T"}
                                      <span className="absolute bottom-[-1.5px] right-[-1.5px] h-3 w-3 rounded-full bg-amber-500 border-2 border-white dark:border-slate-900 shadow-sm"></span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs italic font-medium text-muted-foreground truncate">{person?.name ?? "Invited Talent"}</div>
                                      {role?.roleTitle && (
                                        <div className="text-[10px] text-muted-foreground truncate leading-none mt-1">{role.roleTitle}</div>
                                      )}
                                    </div>
                                  </div>
                                  {isOwner && (
                                    <button
                                      onClick={() => runParticipantCommand("remove", participant)}
                                      className="h-8 w-8 rounded-lg border border-border text-foreground hover:bg-muted/50 inline-flex items-center justify-center cursor-pointer transition-all shrink-0"
                                      title="Cancel invitation and remove"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Hiring Flow Section */}
              <section className="space-y-3">
                <PanelHeader icon={<Briefcase className="h-3.5 w-3.5 text-primary/80" />} label="Hiring Flow" count={roomOffers.length} />
                <div className="space-y-2">
                  {roomOffers.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border/40 p-3 text-xs text-muted-foreground">
                      Complete an interview to send a formal offer.
                    </p>
                  ) : (
                    roomOffers.slice(0, 5).map((offer) => (
                      <div key={offer._id} className="rounded-xl border border-border/40 bg-background/45 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-foreground">{offer.freelancer?.name ?? "Freelancer"}</div>
                            <div className="truncate text-[10px] text-muted-foreground">{offer.role?.roleTitle ?? "Project role"}</div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold capitalize ${
                            offer.status === "accepted" || offer.status === "contracted"
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : offer.status === "declined" || offer.status === "withdrawn"
                                ? "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}>
                            {offer.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                          {offer.amountUsd ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono">${offer.amountUsd.toLocaleString()}</span> : null}
                          <span className="rounded bg-muted px-1.5 py-0.5">{offer.rateType}</span>
                          {offer.sentAt ? <span>{new Date(offer.sentAt).toLocaleDateString()}</span> : null}
                        </div>
                        {offer.responseMessage && (
                          <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{offer.responseMessage}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="rounded-xl border border-border/40 bg-background/45 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">Agreement</span>
                    <span className="text-[10px] font-bold capitalize text-muted-foreground">{workspace.nda?.status?.replace(/_/g, " ") ?? "not generated"}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {workspace.nda ? `${workspace.nda.signedBy?.length ?? 0}/2 signatures recorded` : "Accepted offer will prepare the agreement."}
                  </div>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/45 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">Escrow Simulation</span>
                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      ${workspace.milestones.filter((m: any) => m.status === "released").reduce((sum: number, m: any) => sum + (m.amountUsd ?? 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{workspace.milestones.length} milestone{workspace.milestones.length !== 1 ? "s" : ""}</div>
                </div>
              </section>

              {/* Documents Section with Accordion List */}
              <section className="space-y-3">
                <PanelHeader icon={<FileText className="h-3.5 w-3.5 text-primary/80" />} label={isOwner ? "Required Documents" : "Allowed Docs"} count={workspace.documents.length} />
                
                {workspace.documents.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/40 p-3.5 text-xs text-muted-foreground">No documents are available yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {workspace.documents.map((doc) => {
                      const isExpanded = expandedDocType === doc.docType;
                      return (
                        <div key={`${doc.source}:${doc.documentId ?? doc.docType}`} className="rounded-xl border border-border/40 bg-background/45 overflow-hidden shadow-sm hover:border-border/60 transition-all duration-200">
                          {/* Accordion Header */}
                          <button
                            onClick={() => setExpandedDocType(isExpanded ? null : doc.docType)}
                            className={`w-full flex items-center justify-between p-3 text-left text-xs transition-colors ${
                              isExpanded 
                                ? "bg-primary/5 text-foreground border-b border-border/30 font-bold" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                            }`}
                          >
                            <span className="flex items-center gap-2.5 truncate font-semibold">
                              <FileText className="h-4 w-4 text-primary shrink-0" />
                              <span className="truncate">{doc.title}</span>
                            </span>
                            {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          </button>

                          {/* Accordion Content */}
                          {isExpanded && (
                            <div className="p-3.5 bg-background/30 space-y-3 animate-fadeIn">
                              <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                                <span className="capitalize">Source: {doc.source}</span>
                                <span className={`px-2 py-0.5 rounded-full font-semibold ${
                                  doc.canView 
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}>
                                  {doc.canView ? "Access Granted" : "Pending Access"}
                                </span>
                              </div>

                              <div className="space-y-2 pt-1">
                                <Button
                                  variant="outline"
                                  onClick={() => void openDocument(doc)}
                                  disabled={openingDoc === doc.docType}
                                  className="w-full text-center text-xs font-bold py-2 rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer shadow-sm hover:shadow h-9"
                                >
                                  {openingDoc === doc.docType ? "Opening..." : "View Securely"}
                                </Button>
                                <Button
                                  onClick={() => void downloadDocument(doc)}
                                  className="w-full text-center text-xs font-bold py-2 rounded-lg transition-all duration-200 inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:shadow-md h-9"
                                >
                                  <Download className="h-3.5 w-3.5" /> Download PDF
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <Button
                      variant="outline"
                      onClick={() => void downloadZip()}
                      className="w-full text-xs font-bold rounded-lg px-3 py-2.5 active:scale-[0.98] transition-all duration-200 mt-2.5 cursor-pointer flex items-center justify-center gap-2 h-9"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download visible docs as ZIP
                    </Button>
                  </div>
                )}
              </section>
            </div>
          </aside>
        )}
      </div>

      {docModal && <DocModal doc={docModal} roomId={roomId} onClose={() => setDocModal(null)} />}
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
      <div className="flex justify-center my-2">
        <div className="rounded-full border border-border/40 bg-muted/40 px-3.5 py-1 text-[11px] text-muted-foreground shadow-sm font-medium">
          {message.message}
        </div>
      </div>
    );
  }

  const isAi = message.type === "ai";
  const initials = message.senderName ? message.senderName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "U";

  return (
    <div className={`flex gap-3 my-4 ${isMine ? "flex-row-reverse animate-slideInRight" : "flex-row animate-slideInLeft"}`}>
      {/* Avatar */}
      <div className="shrink-0 self-end mb-1">
        {isAi ? (
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
        ) : (
          <div 
            className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border border-border/50 ${
              isMine ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
            }`}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Message Bubble Container */}
      <div className={`flex flex-col max-w-[74%] ${isMine ? "items-end" : "items-start"}`}>
        {/* Name and Time Header */}
        <div className="flex items-baseline gap-1.5 mb-1 px-1.5">
          <span className={`${isAi ? "text-[13px] font-[800] uppercase tracking-widest" : "text-xs font-bold"} text-foreground/80`}>
            {isAi ? "DEHIX AI" : message.senderName}
          </span>
          {isAi && (
            <span className="text-[11px] font-[400] text-[#6B7280]">AI Assistant</span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono opacity-80 ml-1">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Message Bubble */}
        <div
          className={`px-4 py-2.5 text-sm shadow-sm transition-all duration-200 hover:shadow-md ${
            isAi
              ? "rounded-2xl rounded-tl-sm border border-border/40 bg-muted/20 text-foreground"
              : isMine
                ? "rounded-2xl rounded-tr-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                : "rounded-2xl rounded-tl-sm border border-border/40 bg-card text-foreground"
          }`}
        >
          <div className={isMine ? "text-slate-900 dark:text-slate-100" : "text-foreground"}>
            <MarkdownMini text={message.message} isMine={isMine} />
          </div>
        </div>
      </div>
    </div>
  );
}
