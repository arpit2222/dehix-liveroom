import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { io, type Socket } from "socket.io-client";
import {
  collection, addDoc, serverTimestamp
} from "firebase/firestore";
import { db, isFirebaseEnabled } from "@/lib/firebase";
import {
  useGetRoom, useGetRoomTickets, useGetRoomMilestones, useGetRoomNda,
  useCreateTicket, useUpdateTicket, useCreateMilestone, useSignNda, useGenerateNda,
  useAssembleSquad,
  getGetRoomQueryKey, getGetRoomTicketsQueryKey, getGetRoomMilestonesQueryKey, getGetRoomNdaQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { DocModal } from "@/components/DocModal";
import { toast } from "sonner";
import {
  FileCheck2, FileText, Sparkles, Send, MessageSquare, CheckCircle,
  AlertCircle, RefreshCw, X, Layers, Cpu, Coins, Award, Search,
  Video, ExternalLink, Lock, Plus, ChevronDown, UserPlus,
  MoreVertical, Calendar, Clock, ShieldAlert, FileDown, ArrowLeft, Trash2, ClipboardCheck
} from "lucide-react";

type TabKey = "brief" | "tickets" | "milestones" | "nda" | "activity";

const ACTIVITY_LABELS: Record<string, string> = {
  room_created: "Room created",
  status_changed: "Status changed",
  participant_joined: "Participant joined",
  participant_invited: "Participant invited",
  participant_removed: "Participant removed",
  brief_generated: "AI brief generated",
  nda_generated: "NDA generated",
  nda_signed: "NDA signed",
  milestone_created: "Milestone added",
  milestone_released: "Milestone released",
  milestone_submitted: "Milestone submitted",
  ticket_created: "Ticket created",
  notes_updated: "Notes updated",
  room_contracted: "Room contracted",
  room_closed: "Room closed",
};

const ACTIVITY_ICONS: Record<string, string> = {
  room_created: "🏠",
  status_changed: "⚡",
  participant_joined: "👤",
  participant_invited: "📨",
  participant_removed: "❌",
  brief_generated: "✨",
  nda_generated: "📄",
  nda_signed: "✍",
  milestone_created: "🎯",
  milestone_released: "💚",
  milestone_submitted: "📬",
  ticket_created: "🎫",
  notes_updated: "📝",
  room_contracted: "🤝",
  room_closed: "🔒",
};

function ActivityFeed({ roomId }: { roomId: string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dehix_token");
    fetch(`/api/rooms/${roomId}/activity`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { setActivities(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [roomId]);

  if (loading) {
    return (
      <div className="space-y-3 max-w-2xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-card/40 border border-border/25 animate-pulse" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 p-10 text-center bg-card/10 backdrop-blur-sm max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">No activity recorded yet</p>
        <p className="text-xs text-muted-foreground/50 mt-1 max-w-xs mx-auto">Events like milestone releases, NDA signing, and contract actions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="text-[11px] font-bold text-muted-foreground/75 uppercase tracking-wider mb-1">
        Timeline ({activities.length} event{activities.length !== 1 ? "s" : ""})
      </div>
      <div className="relative border-l border-border/40 pl-4 ml-3 space-y-4 py-2">
        {activities.map((a: any) => (
          <div key={a._id} className="relative flex items-start gap-3 rounded-xl border border-border/30 bg-card/25 hover:border-primary/15 transition-all duration-200 px-4 py-3 shadow-sm">
            <span className="absolute -left-[27px] top-3.5 w-6 h-6 rounded-full bg-background border border-border/60 flex items-center justify-center text-xs shadow-sm">
              {ACTIVITY_ICONS[a.type] ?? "•"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground/90">{ACTIVITY_LABELS[a.type] ?? a.type}</div>
              {a.meta?.title && (
                <div className="text-[11px] text-muted-foreground/90 mt-0.5 font-medium">{String(a.meta.title)}{a.meta?.amountUsd ? ` — $${Number(a.meta.amountUsd).toLocaleString()}` : ""}</div>
              )}
              {a.type === "nda_signed" && (
                <div className="text-[11px] text-muted-foreground/80 mt-0.5">{a.meta?.fullyExecuted ? "Fully executed" : "Partial signature"}</div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/50 shrink-0 font-mono self-start mt-0.5">
              {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TICKET_COLUMNS = [
  { key: "backlog" as const, label: "Backlog" },
  { key: "todo" as const, label: "Todo" },
  { key: "in_progress" as const, label: "In Progress" },
  { key: "done" as const, label: "Done" },
];

const STATUS_COLORS: Record<string, string> = {
  scoping: "text-blue-500 bg-blue-500/10 border-blue-500/25 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20",
  matching: "text-amber-500 bg-amber-500/10 border-amber-500/25 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20",
  open: "text-emerald-500 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20",
  assembling: "text-indigo-500 bg-indigo-500/10 border-indigo-500/25 dark:text-indigo-400 dark:bg-indigo-500/10 dark:border-indigo-500/20",
  contracted: "text-emerald-500 bg-emerald-500/10 border-emerald-500/25 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20",
  closed: "text-muted-foreground bg-muted/20 border-border/55",
};

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  isAi: boolean;
  createdAt: any;
}

let localMsgId = 0;

function MarkdownMini({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let currentList: ReactNode[] = [];
  let isNumberList = false;

  const parseInline = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={idx} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px] font-mono border border-primary/10">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const flushList = (keyPrefix: string) => {
    if (currentList.length > 0) {
      if (isNumberList) {
        elements.push(
          <ol key={`ol-${keyPrefix}`} className="list-decimal pl-5 space-y-1 my-2 text-xs">
            {currentList}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${keyPrefix}`} className="list-disc pl-5 space-y-1 my-2 text-xs">
            {currentList}
          </ul>
        );
      }
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");
    const isNumber = /^\d+\.\s/.test(trimmed);

    if (isBullet || isNumber) {
      if (currentList.length > 0 && isNumberList !== isNumber) {
        flushList(`switch-${i}`);
      }
      isNumberList = isNumber;
      const content = isBullet ? trimmed.substring(2) : trimmed.substring(trimmed.indexOf(".") + 1).trim();
      currentList.push(
        <li key={`li-${i}`} className="text-xs leading-relaxed text-foreground/90">
          {parseInline(content)}
        </li>
      );
    } else {
      flushList(`flush-${i}`);
      if (trimmed) {
        if (trimmed.startsWith("### ")) {
          elements.push(<h4 key={i} className="text-xs font-bold text-foreground mt-3 mb-1 uppercase tracking-wide">{parseInline(trimmed.substring(4))}</h4>);
        } else if (trimmed.startsWith("## ")) {
          elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-4 mb-1.5">{parseInline(trimmed.substring(3))}</h3>);
        } else {
          elements.push(<p key={i} className="my-1.5 leading-relaxed text-xs text-foreground/85">{parseInline(trimmed)}</p>);
        }
      }
    }
  }
  flushList("final");
  return <div className="space-y-1">{elements}</div>;
}

export default function LiveRoom() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("brief");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneAmount, setNewMilestoneAmount] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [docMode, setDocMode] = useState(false);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [docType, setDocType] = useState("pitch_deck");
  const [genDocLoading, setGenDocLoading] = useState(false);
  const [genDocError, setGenDocError] = useState<string | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<{ title: string; documentType: string; content: string; messageCount?: number } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [suggestingMilestones, setSuggestingMilestones] = useState(false);
  const [approvingMilestone, setApprovingMilestone] = useState<string | null>(null);
  const [submittingMilestone, setSubmittingMilestone] = useState<string | null>(null);
  const [matchingTalent, setMatchingTalent] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [suggestingTickets, setSuggestingTickets] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [editingMeetLink, setEditingMeetLink] = useState(false);
  const [meetLinkInput, setMeetLinkInput] = useState("");
  const [savingMeetLink, setSavingMeetLink] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [downloadingRoomPdf, setDownloadingRoomPdf] = useState<"validation" | "blueprint" | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [chatSummary, setChatSummary] = useState<{ summary: string; keyDecisions: string[]; actionItems: string[] } | null>(null);
  const [activityFeed, setActivityFeed] = useState<{ type: string; label: string; at: string; icon: string }[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  const roomId = id ?? "";

  const { data: roomData, isLoading: loadingRoom, refetch: refetchRoom } = useGetRoom(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomQueryKey(roomId) },
  });
  const { data: ticketsData, refetch: refetchTickets } = useGetRoomTickets(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomTicketsQueryKey(roomId) },
  });
  const { data: milestonesData, refetch: refetchMilestones } = useGetRoomMilestones(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomMilestonesQueryKey(roomId) },
  });
  const { data: ndaData, refetch: refetchNda } = useGetRoomNda(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomNdaQueryKey(roomId) },
  });

  const room = roomData as any;
  const tickets = Array.isArray(ticketsData) ? ticketsData : [];
  const milestones = Array.isArray(milestonesData) ? milestonesData : [];
  const nda = ndaData as any;

  const addLocalMessage = useCallback((msg: Omit<ChatMessage, "id" | "createdAt">) => {
    const newMsg: ChatMessage = { ...msg, id: String(++localMsgId), createdAt: new Date() };
    setChatMessages((prev) => [...prev, newMsg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const createTicket = useCreateTicket({
    mutation: { onSuccess: () => { setNewTicketTitle(""); refetchTickets(); } },
  });
  const updateTicket = useUpdateTicket({
    mutation: { onSuccess: () => refetchTickets() },
  });
  const createMilestone = useCreateMilestone({
    mutation: {
      onSuccess: () => { setNewMilestoneTitle(""); setNewMilestoneAmount(""); refetchMilestones(); },
    },
  });
  const signNda = useSignNda({
    mutation: { onSuccess: () => refetchNda() },
  });
  const generateNda = useGenerateNda({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetRoomNdaQueryKey(roomId) });
        refetchNda();
      },
    },
  });
  const assembleSquad = useAssembleSquad({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }) },
  });
  const loadAiChatHistory = async () => {
    if (!roomId) return;
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/ai/chat-history?roomId=${encodeURIComponent(roomId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setChatMessages(Array.isArray(data.messages) ? data.messages : []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      // The room should still render even if AI chat history cannot load.
    }
  };

  const callAiChat = async (message: string) => {
    setAiLoading(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, roomId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Azure OpenAI request failed");
      const aiMsg = data.message ?? { userId: "ai", userName: "DEHIX AI", message: data.reply ?? "I couldn't process that.", isAi: true };
      addLocalMessage(aiMsg);
    } catch (e: any) {
      addLocalMessage({ userId: "ai", userName: "DEHIX AI", message: e.message ?? "Azure OpenAI request failed", isAi: true });
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateDoc = async () => {
    if (startIdx === null || endIdx === null) return;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const selectedMessages = chatMessages.slice(lo, hi + 1);
    setGenDocLoading(true);
    setGenDocError(null);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: selectedMessages.map((m) => ({ userName: m.userName, message: m.message, isAi: m.isAi })),
          documentType: docType,
          roomTitle: room?.title ?? "Project",
          roomId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate document");
      }
      const doc = await res.json();
      setGeneratedDoc(doc);
    } catch (e: any) {
      setGenDocError(e.message ?? "Failed to generate document");
    } finally {
      setGenDocLoading(false);
    }
  };

  useEffect(() => {
    if (!roomId || !user) return;
    const token = localStorage.getItem("dehix_token");
    const socket = io(window.location.origin, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.emit("room:join", { roomId });
    socket.on("connect_error", () => toast.error("Realtime connection failed. Please sign in again."));
    socket.on("room:error", ({ error }: { error: string }) => toast.error(error));
    socket.on("room:participant_joined", () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }));
    socket.on("room:participant_invited", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info("A new talent was invited to this room"); });
    socket.on("room:ticket_updated", () => refetchTickets());
    socket.on("room:milestone_updated", () => refetchMilestones());
    socket.on("room:nda_signed", () => { refetchNda(); toast.info("NDA was signed by a participant"); });
    socket.on("room:squad_formed", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.success("Squad assembled! NDA is ready to sign."); });
    socket.on("room:status_changed", ({ status }: { status: string }) => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info(`Room status changed to ${status}`); });
    socket.on("room:meet_link_updated", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); });
    socket.on("room:notes_updated", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); });
    socket.on("room:participant_removed", () => { queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }); toast.info("A participant was removed from the room"); });
    return () => { socket.disconnect(); };
  }, [roomId, user]);

  useEffect(() => {
    loadAiChatHistory();
  }, [roomId]);

  const sendChat = async () => {
    if (!chatInput.trim() || !roomId || !user) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    addLocalMessage(msgData);
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), {
        ...msgData,
        createdAt: serverTimestamp(),
      });
    }
  };

  const askAi = async () => {
    if (!chatInput.trim() || !roomId || !user || aiLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    addLocalMessage(msgData);
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), { ...msgData, createdAt: serverTimestamp() });
    }
    await callAiChat(msg);
  };

  const loadActivity = async () => {
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/activity`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setActivityFeed(Array.isArray(data) ? data : []);
      setShowActivity(true);
    } catch {
      toast.error("Failed to load activity");
    }
  };

  const summarizeChat = async () => {
    if (chatMessages.length === 0) { toast.info("No messages to summarize yet"); return; }
    setSummaryLoading(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/chat-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: chatMessages.map(m => ({ userName: m.userName, message: m.message, isAi: m.isAi })), roomId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to summarize");
      }
      const data = await res.json();
      setChatSummary(data);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to summarize conversation");
    } finally {
      setSummaryLoading(false);
    }
  };

  const updateRoomStatus = async (newStatus: string) => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    setStatusDropdown(false);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      toast.success(`Room status updated to ${newStatus}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const saveMeetLink = async () => {
    if (savingMeetLink) return;
    setSavingMeetLink(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/meet-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetLink: meetLinkInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save meet link");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      setEditingMeetLink(false);
      toast.success("Meet link saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save meet link");
    } finally {
      setSavingMeetLink(false);
    }
  };

  const saveNotes = async () => {
    if (savingNotes) return;
    setSavingNotes(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: notesInput.trim() }),
      });
      if (!res.ok) throw new Error("Failed to save notes");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      setEditingNotes(false);
      toast.success("Notes saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const generateBrief = async () => {
    if (generatingBrief) return;
    setGeneratingBrief(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const scopeRes = await fetch("/api/ai/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: room?.rawDescription ?? room?.title, roomId }),
      });
      if (!scopeRes.ok) {
        const err = await scopeRes.json().catch(() => ({}));
        throw new Error(err.error ?? "AI scoping failed");
      }
      const briefData = await scopeRes.json();
      const saveRes = await fetch(`/api/rooms/${roomId}/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brief: briefData }),
      });
      if (!saveRes.ok) throw new Error("Failed to save brief");
      queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      toast.success("AI brief generated and saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate brief");
    } finally {
      setGeneratingBrief(false);
    }
  };

  const copyRoomCode = () => {
    if (!room?.roomCode) return;
    navigator.clipboard.writeText(room.roomCode).then(
      () => toast.success(`Room code ${room.roomCode} copied!`),
      () => toast.error("Could not copy room code")
    );
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const matchTalentForRoom = async () => {
    if (!roomId || matchingTalent) return;
    setMatchingTalent(true);
    setMatchResults([]);
    try {
      const token = localStorage.getItem("dehix_token");
      const room = roomData as any;
      const roles: any[] = room?.brief?.roles ?? [];
      if (roles.length === 0) { toast.info("Generate an AI brief first to get role requirements"); setMatchingTalent(false); return; }
      const firstRole = roles[0];
      const res = await fetch("/api/ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roleTitle: firstRole.roleTitle, skillDomain: firstRole.skillDomain, requiredLevel: firstRole.requiredLevel ?? 1, minReputation: firstRole.minReputation ?? 0 }),
      });
      if (!res.ok) throw new Error("Match failed");
      const data = await res.json();
      setMatchResults(Array.isArray(data) ? data : []);
      if (data.length === 0) toast.info("No matching talent found yet");
      else toast.success(`${data.length} matching candidate${data.length !== 1 ? "s" : ""} found`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to match talent");
    } finally {
      setMatchingTalent(false);
    }
  };

  const suggestMilestones = async () => {
    if (!roomId || suggestingMilestones) return;
    setSuggestingMilestones(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/suggest-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const data = await res.json();
      const suggestions = Array.isArray(data) ? data : data.milestones ?? [];
      for (const s of suggestions) {
        await fetch(`/api/rooms/${roomId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: s.title ?? s, description: s.description ?? undefined, amountUsd: s.amountUsd ?? undefined }),
        });
      }
      refetchMilestones();
      toast.success(`${suggestions.length} milestones added`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to suggest milestones");
    } finally {
      setSuggestingMilestones(false);
    }
  };

  const submitMilestone = async (milestoneId: string) => {
    if (submittingMilestone) return;
    setSubmittingMilestone(milestoneId);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/submit`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to submit milestone");
      refetchMilestones();
      toast.success("Milestone submitted for business review");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit milestone");
    } finally {
      setSubmittingMilestone(null);
    }
  };

  const approveMilestone = async (milestoneId: string) => {
    if (approvingMilestone) return;
    setApprovingMilestone(milestoneId);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/approve`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to approve milestone");
      refetchMilestones();
      toast.success("Milestone approved and payment released");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to approve milestone");
    } finally {
      setApprovingMilestone(null);
    }
  };

  const updateMilestoneStatus = async (milestoneId: string, status: string) => {
    try {
      const token = localStorage.getItem("dehix_token");
      await fetch(`/api/rooms/${roomId}/milestones/${milestoneId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      refetchMilestones();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update milestone status");
    }
  };

  const suggestTickets = async () => {
    if (!roomId || suggestingTickets) return;
    setSuggestingTickets(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch("/api/ai/suggest-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      const suggestions: Array<{ title: string; description?: string; roleTitle?: string; estimatedHours?: number; milestoneNumber?: number }> = await res.json();
      for (const s of suggestions) {
        await fetch(`/api/rooms/${roomId}/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: s.title,
            description: s.description ?? undefined,
            assignedRole: s.roleTitle ?? undefined,
            estimatedHours: s.estimatedHours ?? undefined,
            milestoneNumber: s.milestoneNumber ?? 1,
          }),
        });
      }
      refetchTickets();
      toast.success(`${suggestions.length} tickets generated`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate tickets");
    } finally {
      setSuggestingTickets(false);
    }
  };

  const readApiError = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null);
    return data?.error ?? fallback;
  };

  const downloadRoomReportPdf = async (kind: "validation" | "blueprint") => {
    if (!roomId || downloadingRoomPdf) return;
    setDownloadingRoomPdf(kind);
    try {
      const token = localStorage.getItem("dehix_token");
      const path = kind === "validation" ? "business-validation.pdf" : "business-blueprint.pdf";
      const res = await fetch(`/api/rooms/${roomId}/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Failed to download ${kind} PDF`));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${room?.roomCode ?? "room"}-${kind === "validation" ? "business-validation" : "business-blueprint"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${kind === "validation" ? "Validation" : "Blueprint"} PDF downloaded`);
    } catch (e: any) {
      toast.error(e.message ?? `Failed to download ${kind} PDF`);
    } finally {
      setDownloadingRoomPdf(null);
    }
  };

  const downloadAllDocumentsZip = async () => {
    if (!roomId || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const token = localStorage.getItem("dehix_token");
      const res = await fetch(`/api/rooms/${roomId}/documents-zip`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Failed to download ZIP archive"));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${room?.roomCode ?? "room"}-all-documents.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("ZIP archive containing all documents downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to download ZIP archive");
    } finally {
      setDownloadingZip(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in to join this room</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }
  if (loadingRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading room...</div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Room not found</p>
          <Button onClick={() => navigate("/business/dashboard")}>Back</Button>
        </div>
      </div>
    );
  }

  const brief = room.aiScopedBrief as any;
  const roles = room.roles ?? [];
  const participants = room.participants ?? [];
  const isBusiness = user?.role === "business";
  const isOwner = isBusiness;
  const allRolesFilled = roles.length > 0 && roles.every((r: any) => ["filled", "accepted"].includes(r.status));
  const isSignedByMe = nda?.signedBy?.includes(user?._id ?? "");

  return (
    <>
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* TOP BAR */}
      <div className="shrink-0 border-b border-border/30 bg-background/55 backdrop-blur-md relative z-10">
        <div className="h-14 px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(isBusiness ? "/business/dashboard" : "/talent/dashboard")}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/15 transition-all shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-border/40 shrink-0">/</span>
            <span className="font-bold text-sm tracking-wide text-foreground/90 truncate">{room.title}</span>
            {isBusiness ? (
              <div className="relative shrink-0">
                <button
                  onClick={() => setStatusDropdown(!statusDropdown)}
                  disabled={updatingStatus}
                  className={`text-xs px-2.5 py-1 rounded-md border font-bold capitalize hover:opacity-90 transition-all flex items-center gap-1 shadow-sm ${STATUS_COLORS[room.status] ?? ""}`}
                >
                  {updatingStatus ? (
                    <span className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                  ) : room.status}
                  {!updatingStatus && <ChevronDown className="h-3 w-3 opacity-60" />}
                </button>
                {statusDropdown && (
                  <div className="absolute top-full left-0 mt-1.5 z-50 bg-card border border-border/45 rounded-xl shadow-lg overflow-hidden min-w-[150px] backdrop-blur-md">
                    {["scoping","matching","open","assembling","contracted","closed"].filter(s => s !== room.status).map(s => (
                      <button
                        key={s}
                        onClick={() => updateRoomStatus(s)}
                        className="w-full text-left px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors capitalize"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={`text-xs px-2.5 py-1 rounded-md border font-bold capitalize shrink-0 shadow-sm ${STATUS_COLORS[room.status] ?? ""}`}>
                {room.status}
              </span>
            )}
            <button
              onClick={copyRoomCode}
              title="Copy room code"
              className="text-xs font-mono text-muted-foreground/80 hover:text-foreground transition-all px-2.5 py-1 rounded-lg border border-border/30 bg-muted/20 hover:bg-muted/40 font-semibold flex items-center gap-1.5"
            >
              {copiedCode ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">✓ Copied!</span>
              ) : (
                <>
                  <ClipboardCheck className="h-3.5 w-3.5 opacity-60" />
                  {room.roomCode}
                </>
              )}
            </button>
            {room.contractedAt && (
              <span className="text-[10px] text-blue-500 bg-blue-500/5 border border-blue-500/10 px-2.5 py-0.5 rounded-md font-medium hidden md:inline-flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                Contracted {new Date(room.contractedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isFirebaseEnabled && (
              <span className="text-[10px] text-amber-500 border border-amber-500/20 bg-amber-500/10 rounded-lg px-2.5 py-1 font-semibold hidden sm:inline-block">
                Demo Chat
              </span>
            )}
            {isBusiness && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => downloadRoomReportPdf("validation")}
                  disabled={downloadingRoomPdf !== null}
                  title="Download business validation PDF"
                  className="text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/25 disabled:opacity-50 transition-all px-3 py-1.5 rounded-lg border border-border/40 bg-card/65 shadow-sm inline-flex items-center gap-1.5"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  {downloadingRoomPdf === "validation" ? "Scoping..." : "Validation PDF"}
                </button>
                <button
                  onClick={() => downloadRoomReportPdf("blueprint")}
                  disabled={downloadingRoomPdf !== null}
                  title="Download business blueprint PDF"
                  className="text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/25 disabled:opacity-50 transition-all px-3 py-1.5 rounded-lg border border-border/40 bg-card/65 shadow-sm inline-flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {downloadingRoomPdf === "blueprint" ? "Scoping..." : "Blueprint PDF"}
                </button>
                <button
                  onClick={downloadAllDocumentsZip}
                  disabled={downloadingZip}
                  title="Download all generated documents as a ZIP archive of separate PDFs"
                  className="text-[11px] font-bold text-primary hover:text-primary-foreground hover:bg-primary/95 disabled:opacity-50 transition-all px-3 py-1.5 rounded-lg border border-primary/25 bg-primary/10 inline-flex items-center gap-1.5"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  {downloadingZip ? "Zipping..." : "All Docs (ZIP)"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem("dehix_token");
                      const res = await fetch(`/api/rooms/${roomId}/export`, { headers: { Authorization: `Bearer ${token}` } });
                      if (!res.ok) throw new Error("Export failed");
                      const { filename, content } = await res.json();
                      const blob = new Blob([content], { type: "text/markdown" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = filename; a.click();
                      URL.revokeObjectURL(url);
                      toast.success("Room exported");
                    } catch {
                      toast.error("Export failed");
                    }
                  }}
                  title="Export room summary"
                  className="text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-border/65 transition-all px-3 py-1.5 rounded-lg border border-border/40 hover:bg-card/60 inline-flex items-center gap-1"
                >
                  ↓ Export
                </button>
              </div>
            )}
            {room.meetLink && (
              <a href={room.meetLink} target="_blank" rel="noreferrer" className="shrink-0">
                <Button size="sm" variant="outline" className="text-xs h-8 border-emerald-500/25 bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500/10 flex items-center gap-1 font-bold">
                  <Video className="h-3.5 w-3.5" />
                  Meet
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT */}
        <div className="w-60 shrink-0 border-r border-border/30 flex flex-col overflow-y-auto bg-card/20 backdrop-blur-sm">
          <div className="p-4 space-y-6">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-3 flex items-center justify-between border-b border-border/20 pb-1.5">
                <span>Roles</span>
                <span className="px-1.5 py-0.5 rounded-full bg-muted/60 text-[9px] font-mono text-muted-foreground">{roles.length}</span>
              </div>
              {roles.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-4 text-center border border-dashed border-border/40 rounded-xl bg-background/25">No roles defined</div>
              ) : (
                <div className="space-y-2.5">
                  {roles.map((role: any) => {
                    const isFilled = ["filled", "accepted"].includes(role.status);
                    return (
                      <div key={role._id} className="rounded-xl border border-border/40 bg-background/55 p-3 hover:border-primary/20 hover:bg-background/85 transition-all duration-200 shadow-sm relative overflow-hidden group">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-xs font-semibold text-foreground/90 leading-snug line-clamp-2">{role.roleTitle}</span>
                          <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-md border font-bold uppercase ${
                            isFilled
                              ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                              : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                          }`}>
                            {role.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/85 flex items-center gap-1.5 mt-1">
                          <Layers className="h-3 w-3 text-muted-foreground/60" />
                          <span className="truncate">{role.skillDomain}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 font-mono mt-1.5 flex items-center justify-between">
                          <span>L{role.requiredLevel} · {role.minReputation}+ rep</span>
                          {role.estimatedHours && <span>{role.estimatedHours}h</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-3 flex items-center justify-between border-b border-border/20 pb-1.5">
                <span>Participants</span>
                <span className="px-1.5 py-0.5 rounded-full bg-muted/60 text-[9px] font-mono text-muted-foreground">{participants.length}</span>
              </div>
              {participants.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-4 text-center border border-dashed border-border/40 rounded-xl bg-background/25">Waiting for talent</div>
              ) : (
                <div className="space-y-2.5">
                  {participants.map((p: any) => {
                    const u = p.user ?? (typeof p.userId === "object" ? p.userId : null);
                    const matchedRole = roles.find((r: any) => String(r._id) === String(p.roleId));
                    return (
                      <div
                        key={p._id}
                        className="rounded-xl border border-border/40 bg-background/55 p-3 hover:border-primary/20 hover:bg-background/85 transition-all duration-200 shadow-sm group"
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => u?._id && navigate(`/talent/profile/${u._id}`)}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                          >
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/10 to-indigo-500/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0 shadow-inner">
                                {u?.name?.[0]?.toUpperCase() ?? "?"}
                              </div>
                              {p.status === "joined" && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-background animate-pulse" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground/90 truncate group-hover:text-primary transition-colors">{u?.name ?? "User"}</div>
                              <div className="flex items-center gap-1 truncate mt-0.5">
                                <span className={`text-[10px] capitalize font-medium ${p.status === "joined" ? "text-emerald-500" : "text-muted-foreground/80"}`}>
                                  {p.status}
                                </span>
                                {matchedRole && (
                                  <>
                                    <span className="text-border/40 text-[9px]">·</span>
                                    <span className="text-[10px] text-primary/80 truncate font-medium">{matchedRole.roleTitle}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                          {isBusiness && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Remove ${u?.name ?? "this participant"} from the room?`)) return;
                                try {
                                  const token = localStorage.getItem("dehix_token");
                                  const res = await fetch(`/api/rooms/${roomId}/participants/${p._id}`, {
                                    method: "DELETE",
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  if (!res.ok) throw new Error("Failed");
                                  queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
                                  toast.success(`${u?.name ?? "Participant"} removed`);
                                } catch {
                                  toast.error("Failed to remove participant");
                                }
                              }}
                              title="Remove from room"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive/50 hover:text-destructive text-[10px] shrink-0 p-1 hover:bg-destructive/10 rounded-md"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 border-b border-border/20 pb-1.5">
                <div className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">Notes</div>
                <button
                  onClick={() => {
                    setNotesInput(room?.notes ?? "");
                    setEditingNotes(!editingNotes);
                  }}
                  className="text-[10px] font-semibold text-muted-foreground/80 hover:text-primary transition-colors"
                >
                  {editingNotes ? "Cancel" : "Edit"}
                </button>
              </div>
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add private room notes..."
                    rows={4}
                    className="w-full bg-card/65 border border-border/50 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 placeholder:text-muted-foreground/35 resize-none text-foreground/90 font-sans"
                  />
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="w-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg py-2 transition-all shadow-sm"
                  >
                    {savingNotes ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              ) : room?.notes ? (
                <div className="rounded-xl border border-border/40 border-dashed bg-background/45 p-3 text-[11px] text-muted-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {room.notes}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/40 py-3 text-center border border-dashed border-border/40 rounded-xl bg-background/25">No notes yet</div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-background/5">
          <div className="shrink-0 border-b border-border/30 px-5 flex items-center gap-1.5 h-14 bg-background/20">
            {(["brief", "tickets", "milestones", "nda", "activity"] as TabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all capitalize relative flex items-center gap-1.5 ${
                  tab === t
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/10 border border-transparent"
                }`}
              >
                {t}
                {t === "tickets" && tickets.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-muted/65 text-muted-foreground/80 font-bold font-mono">{tickets.length}</span>
                )}
                {t === "milestones" && milestones.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-muted/65 text-muted-foreground/80 font-bold font-mono">{milestones.length}</span>
                )}
                {t === "nda" && nda && (
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${nda.status === "signed" ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-amber-400 shadow-sm shadow-amber-400/50"}`} />
                )}
              </button>
            ))}
          </div>

          {/* Quick Stats bar */}
          {(tickets.length > 0 || milestones.length > 0) && (
            <div className="shrink-0 border-b border-border/30 px-5 py-2.5 flex items-center justify-between gap-6 bg-card/10 backdrop-blur-sm overflow-x-auto">
              <div className="flex items-center gap-5">
                {tickets.length > 0 && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Tickets Done</span>
                    <span className="text-xs font-bold font-mono text-foreground">
                      {tickets.filter((t: any) => t.status === "done").length}/{tickets.length}
                    </span>
                    <div className="w-20 h-1.5 rounded-full bg-muted/65 overflow-hidden border border-border/20">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-indigo-500 rounded-full transition-all"
                        style={{ width: `${(tickets.filter((t: any) => t.status === "done").length / tickets.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {tickets.length > 0 && milestones.length > 0 && <span className="text-border/40 shrink-0">|</span>}
                {milestones.length > 0 && (
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider">Escrow Released</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold font-mono text-emerald-500">
                        ${milestones.filter((m: any) => m.status === "released").reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">/</span>
                      <span className="text-xs font-semibold font-mono text-muted-foreground">
                        ${milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="w-20 h-1.5 rounded-full bg-muted/65 overflow-hidden border border-border/20">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                        style={{ width: `${(milestones.filter((m: any) => m.status === "released").reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0) / (milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0) || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              {participants.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md border border-border/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  <span>{participants.filter((p: any) => p.status === "joined").length} Joined</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{roles.length} Roles Required</span>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">
            {/* BRIEF */}
            {tab === "brief" && (
              <div className="space-y-6 max-w-3xl">
                {generatingBrief && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center space-y-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-indigo-500 animate-pulse" />
                    <div className="flex justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground/90">AI Scoping Engine Active</h3>
                    <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">Analyzing your description to draft roles, stacks, deliverables, duration estimates, and risk analysis...</p>
                  </div>
                )}
                {!brief && !generatingBrief ? (
                  <div className="space-y-4">
                    {room?.rawDescription && (
                      <div className="rounded-2xl border border-border/40 bg-card/40 p-5 shadow-sm">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-muted-foreground/60" /> Project Description</div>
                        <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{room.rawDescription}</p>
                      </div>
                    )}
                    <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center space-y-4 bg-card/10">
                      <p className="text-sm font-semibold text-foreground/75">AI Scope Map Unpopulated</p>
                      <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-xs mx-auto">
                        Generate a comprehensive project brief featuring required skills, technical architecture stacks, timeline weeks, and risk mitigations.
                      </p>
                      {isOwner && (
                        <Button size="sm" onClick={generateBrief} disabled={generatingBrief} className="shadow-sm font-semibold">
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate AI Brief
                        </Button>
                      )}
                    </div>
                  </div>
                ) : brief && !generatingBrief ? (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-border/20 pb-2">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Project Specification</div>
                      {isOwner && (
                        <button
                          onClick={generateBrief}
                          className="text-xs font-semibold text-primary/75 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="h-3 w-3" /> Scope Refresh
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-indigo-500/5 p-6 shadow-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-15">
                        <Sparkles className="h-16 w-16 text-primary animate-pulse" />
                      </div>
                      <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI Project Scope</div>
                      <h2 className="font-extrabold text-lg text-foreground/90 mb-2 leading-snug">{brief.projectTitle}</h2>
                      <p className="text-xs text-muted-foreground/90 leading-relaxed max-w-2xl">{brief.projectSummary}</p>
                      
                      <div className="flex items-center gap-4 mt-5 flex-wrap border-t border-border/20 pt-4">
                        <div className="bg-background/55 border border-border/30 rounded-xl px-3 py-1.5 shadow-sm text-center">
                          <div className="text-[10px] text-muted-foreground font-semibold">Timeline</div>
                          <div className="text-xs font-bold font-mono text-foreground mt-0.5">{brief.estimatedWeeks} Weeks</div>
                        </div>
                        <div className="bg-background/55 border border-border/30 rounded-xl px-3 py-1.5 shadow-sm text-center capitalize">
                          <div className="text-[10px] text-muted-foreground font-semibold">Complexity</div>
                          <div className="text-xs font-bold text-foreground mt-0.5">{brief.complexity}</div>
                        </div>
                        {brief.suggestedTotalBudgetUsd && (
                          <div className="bg-background/55 border border-border/30 rounded-xl px-3 py-1.5 shadow-sm text-center">
                            <div className="text-[10px] text-muted-foreground font-semibold">Est. Budget</div>
                            <div className="text-xs font-bold font-mono text-emerald-500 mt-0.5">${brief.suggestedTotalBudgetUsd?.toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {brief.recommendedStack && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Recommended Technical Stack</div>
                        <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-3.5 text-xs text-foreground/80 leading-relaxed shadow-sm font-semibold flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-primary shrink-0" />
                          <span>{brief.recommendedStack}</span>
                        </div>
                      </div>
                    )}

                    {brief.roles?.length > 0 && (() => {
                      const totalHours = (brief.roles as any[]).reduce((s: number, r: any) => s + (r.estimatedHours ?? 0), 0);
                      return totalHours > 0 ? (
                        <div className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/45 px-4 py-3 text-xs text-muted-foreground flex-wrap shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <span className="font-mono font-bold text-foreground">{totalHours}h</span>
                            <span>allocated across {brief.roles.length} role{brief.roles.length !== 1 ? "s" : ""}</span>
                          </div>
                          {brief.suggestedTotalBudgetUsd && (
                            <>
                              <span className="text-border/40">·</span>
                              <div className="flex items-center gap-1.5">
                                <Coins className="h-3.5 w-3.5 text-muted-foreground/60" />
                                <span className="font-mono font-bold text-foreground">${brief.suggestedTotalBudgetUsd.toLocaleString()}</span>
                                <span>target budget</span>
                              </div>
                            </>
                          )}
                          {brief.estimatedWeeks && (
                            <>
                              <span className="text-border/40">·</span>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                                <span className="font-mono font-bold text-foreground">{brief.estimatedWeeks}w</span>
                                <span>duration</span>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {brief.roles?.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Required Skill Resources</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {brief.roles.map((r: any, i: number) => (
                            <div key={i} className="rounded-xl border border-border/45 bg-card/35 p-4 flex flex-col justify-between shadow-sm hover:border-primary/25 transition-all">
                              <div>
                                <div className="flex items-start justify-between gap-2 border-b border-border/20 pb-2 mb-2">
                                  <span className="text-xs font-bold text-foreground/90">{r.roleTitle}</span>
                                  <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary uppercase">L{r.requiredLevel}</span>
                                </div>
                                <div className="text-[10px] text-primary font-semibold mb-2 flex items-center gap-1.5">
                                  <Layers className="h-3 w-3 shrink-0" />
                                  {r.skillDomain}
                                </div>
                                {r.responsibilities?.length > 0 && (
                                  <div className="text-[10px] text-muted-foreground/80 leading-relaxed line-clamp-3">
                                    {r.responsibilities.join(" · ")}
                                  </div>
                                )}
                              </div>
                              <div className="mt-4 pt-3 border-t border-border/25 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{r.minReputation}+ Reputation</span>
                                {r.estimatedHours && <span className="font-mono font-semibold">{r.estimatedHours} Hours</span>}
                                {isBusiness && (
                                  <button
                                    onClick={() => navigate(`/talent/discovery?skill=${encodeURIComponent(r.skillDomain ?? "")}&minRep=${r.minReputation ?? 0}`)}
                                    className="text-[10px] text-primary hover:text-indigo-400 font-bold flex items-center gap-0.5 bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-md px-2 py-1 transition-all"
                                  >
                                    Find →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {brief.technicalRisks?.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Risk Management Analysis</div>
                        <div className="grid gap-2">
                          {brief.technicalRisks.map((r: string, i: number) => (
                            <div key={i} className="flex items-start gap-2.5 text-xs bg-destructive/5 border border-destructive/15 rounded-xl px-4 py-3 text-destructive/90 shadow-sm">
                              <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isBusiness && brief.roles?.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border/20 pb-2">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Talent Match Engine</div>
                          <button
                            onClick={matchTalentForRoom}
                            disabled={matchingTalent}
                            className="text-xs font-semibold text-primary hover:text-indigo-400 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {matchingTalent ? (
                              <><span className="w-3.5 h-3.5 rounded-full border border-primary/30 border-t-primary animate-spin inline-block" /> Matching Candidates...</>
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5" /> Search candidates</>
                            )}
                          </button>
                        </div>
                        {matchResults.length > 0 && (
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            {matchResults.map((m: any) => (
                              <div key={m.user._id} className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3 hover:border-primary/45 hover:bg-primary/10 transition-all shadow-sm">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-foreground/90">{m.user.name}</div>
                                  <div className="text-[10px] font-semibold text-primary mt-0.5 truncate">{m.credential?.skillDomain}</div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <span className="text-[10px] font-mono text-muted-foreground/80 bg-background/50 border border-border/30 px-2 py-0.5 rounded-md">{m.credential?.reputationScore} rep</span>
                                  <button
                                    onClick={() => navigate(`/talent/profile/${m.user._id}`)}
                                    className="text-[10px] font-bold text-primary hover:underline"
                                  >
                                    Profile →
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* TICKETS */}
            {tab === "tickets" && (
              <div className="space-y-5">
                {isBusiness && (
                  <div className="space-y-3 bg-card/25 border border-border/30 rounded-2xl p-4 shadow-sm max-w-3xl">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New Work Ticket</div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newTicketTitle.trim()) {
                          createTicket.mutate({ id: roomId, data: { title: newTicketTitle, milestoneNumber: 1 } });
                          setNewTicketTitle("");
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newTicketTitle}
                        onChange={(e) => setNewTicketTitle(e.target.value)}
                        placeholder="Define a deliverables ticket..."
                        className="flex-1 bg-background border border-border/50 rounded-lg px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 placeholder:text-muted-foreground/35 text-foreground/90"
                      />
                      <Button size="sm" type="submit" disabled={createTicket.isPending} className="font-semibold shadow-sm px-4">Add Ticket</Button>
                    </form>
                    <button
                      onClick={suggestTickets}
                      disabled={suggestingTickets}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {suggestingTickets ? (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full border border-primary/30 border-t-primary animate-spin" />
                          AI Scoper is planning tickets...
                        </>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5" /> Generate tickets list from AI Brief</>
                      )}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {TICKET_COLUMNS.map((col) => {
                    const colTickets = tickets.filter((t: any) => t.status === col.key);
                    return (
                      <div key={col.key} className="space-y-3 bg-card/10 border border-border/25 rounded-2xl p-3 shadow-inner min-h-[250px]">
                        <div className="flex items-center justify-between border-b border-border/20 pb-2 px-1">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{col.label}</span>
                          <span className="px-2 py-0.5 rounded-full bg-muted/65 text-[10px] font-bold font-mono text-muted-foreground">{colTickets.length}</span>
                        </div>
                        <div className="space-y-2 min-h-[180px]">
                          {colTickets.map((t: any) => (
                            <div key={t._id} className={`rounded-xl border bg-background/55 p-3.5 hover:border-primary/20 hover:bg-background/85 transition-all duration-200 shadow-sm group border-l-4 relative overflow-hidden ${
                              t.priority === "critical" ? "border-l-red-500 shadow-red-500/5" :
                              t.priority === "high" ? "border-l-amber-500 shadow-amber-500/5" :
                              t.priority === "low" ? "border-l-blue-500 shadow-blue-500/5" :
                              "border-l-border/60"
                            }`}>
                              <p className="text-xs font-semibold leading-normal text-foreground/90 mb-2.5">{t.title}</p>
                              
                              <div className="flex items-center justify-between gap-2 border-b border-border/10 pb-2 mb-2">
                                {t.estimatedHours ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-muted/60 border border-border/30 px-1.5 py-0.5 rounded-md text-muted-foreground font-mono">
                                    <Clock className="h-3 w-3" /> {t.estimatedHours}h
                                  </span>
                                ) : (
                                  <span />
                                )}
                                {t.priority && t.priority !== "medium" && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border uppercase ${
                                    t.priority === "critical" ? "text-red-500 bg-red-500/10 border-red-500/20" :
                                    t.priority === "high" ? "text-amber-500 bg-amber-500/10 border-amber-500/20" :
                                    "text-blue-500 bg-blue-500/10 border-blue-500/20"
                                  }`}>{t.priority}</span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
                                {TICKET_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                                  <button
                                    key={c.key}
                                    onClick={() => updateTicket.mutate({ id: t._id, data: { status: c.key } })}
                                    className="text-[9px] font-bold text-muted-foreground/60 hover:text-primary border border-border/30 hover:border-primary/30 bg-background hover:bg-primary/5 rounded px-2 py-0.5 transition-all"
                                  >
                                    → {c.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MILESTONES */}
            {tab === "milestones" && (
              <div className="space-y-5 max-w-3xl">
                {isBusiness && (
                  <div className="space-y-3 bg-card/25 border border-border/30 rounded-2xl p-4 shadow-sm">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Define Milestone Checkpoint</div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newMilestoneTitle.trim()) {
                          createMilestone.mutate({
                            id: roomId,
                            data: { title: newMilestoneTitle, amountUsd: newMilestoneAmount ? Number(newMilestoneAmount) : undefined },
                          });
                          setNewMilestoneTitle("");
                          setNewMilestoneAmount("");
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newMilestoneTitle}
                        onChange={(e) => setNewMilestoneTitle(e.target.value)}
                        placeholder="Milestone checkpoint title..."
                        className="flex-1 bg-background border border-border/50 rounded-lg px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 placeholder:text-muted-foreground/35 text-foreground/90"
                      />
                      <input
                        value={newMilestoneAmount}
                        onChange={(e) => setNewMilestoneAmount(e.target.value)}
                        placeholder="$ USD"
                        type="number"
                        className="w-28 bg-background border border-border/50 rounded-lg px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 font-mono text-emerald-500 placeholder:text-muted-foreground/35"
                      />
                      <Button size="sm" type="submit" disabled={createMilestone.isPending} className="font-semibold shadow-sm px-4">Add</Button>
                    </form>
                    <button
                      onClick={suggestMilestones}
                      disabled={suggestingMilestones}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {suggestingMilestones ? (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full border border-primary/30 border-t-primary animate-spin" />
                          AI is structuring milestones...
                        </>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5" /> Suggest milestones list using AI Scope Brief</>
                      )}
                    </button>
                  </div>
                )}
                {milestones.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/50 p-10 text-center bg-card/10">
                    <p className="text-sm font-semibold text-muted-foreground">No milestone timeline established yet</p>
                    {isBusiness && (
                      <p className="text-xs text-muted-foreground/50 mt-1.5 max-w-xs mx-auto">Create milestone release releases manually or trigger AI Scoping to formulate recommended stages.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3.5 relative border-l border-border/40 pl-5 ml-4 py-2">
                    {milestones.map((m: any, i: number) => {
                      const isReleased = m.status === "released";
                      const isSubmitted = m.status === "submitted";
                      return (
                        <div key={m._id} className={`relative rounded-xl border bg-background/55 p-4 transition-all duration-200 shadow-sm flex items-start justify-between gap-4 ${
                          isReleased ? "border-emerald-500/25 bg-emerald-500/5 shadow-inner" : "border-border/40 hover:border-border/60"
                        }`}>
                          <div className="absolute -left-[32px] top-4">
                            {isReleased ? (
                              <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500 flex items-center justify-center text-emerald-500 shadow-sm">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-background border border-border/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground shadow-sm">
                                {i + 1}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-xs text-foreground/90">{m.title}</h3>
                            {m.description && <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{m.description}</p>}
                            {!isBusiness && !isReleased && !isSubmitted && (
                              <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-border/10">
                                {["pending", "in_progress", "completed"].filter(s => s !== m.status).map(s => (
                                  <button
                                    key={s}
                                    onClick={() => updateMilestoneStatus(m._id, s)}
                                    className="text-[9px] font-bold text-muted-foreground/60 hover:text-primary border border-border/30 hover:border-primary/35 bg-background px-2 py-0.5 rounded transition-all capitalize"
                                  >
                                    → {s.replace("_", " ")}
                                  </button>
                                ))}
                                <button
                                  onClick={() => submitMilestone(m._id)}
                                  disabled={submittingMilestone === m._id}
                                  className="text-[9px] font-bold text-blue-500 hover:text-blue-600 border border-blue-500/25 hover:border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 rounded px-2.5 py-0.5 transition-all disabled:opacity-50"
                                >
                                  {submittingMilestone === m._id ? "..." : "↑ Submit Review"}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0 space-y-2 flex flex-col items-end">
                            {m.amountUsd != null && (
                              <div className="font-mono font-bold text-sm text-foreground">${m.amountUsd.toLocaleString()}</div>
                            )}
                            <div>
                              <span className={`text-[9px] px-2 py-0.5 rounded-md border font-bold uppercase ${
                                isReleased ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                                m.status === "completed" ? "text-blue-500 bg-blue-500/10 border-blue-500/20" :
                                isSubmitted ? "text-indigo-500 bg-indigo-500/10 border-indigo-500/20 animate-pulse" :
                                m.status === "in_progress" ? "text-amber-500 bg-amber-500/10 border-amber-500/20" :
                                "text-muted-foreground bg-muted/20 border-border/40"
                              }`}>
                                {m.status.replace("_", " ")}
                              </span>
                            </div>
                            {isBusiness && !isReleased && (
                              <button
                                onClick={() => approveMilestone(m._id)}
                                disabled={approvingMilestone === m._id}
                                className={`text-[10px] font-bold border rounded-lg px-2.5 py-1 transition-all disabled:opacity-50 ${
                                  isSubmitted
                                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/35 hover:bg-emerald-500/20 shadow-sm animate-pulse"
                                    : "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/25"
                                }`}
                              >
                                {approvingMilestone === m._id ? "..." : "✓ Release"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="rounded-xl border border-border/45 bg-card/40 px-4 py-3 text-xs text-muted-foreground/80 flex items-center justify-between shadow-sm">
                      <span className="font-semibold">Cumulative Escrow Releases</span>
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-500 font-mono font-semibold">
                          ${milestones.filter((m: any) => m.status === "released").reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()} released
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          ${milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()} total
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* ACTIVITY */}
            {tab === "activity" && (
              <ActivityFeed roomId={roomId} />
            )}

            {/* NDA */}
            {tab === "nda" && (
              <div className="space-y-5 max-w-2xl">
                {/* Generation loading state */}
                {generateNda.isPending && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center space-y-4 shadow-sm backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-indigo-500 animate-pulse" />
                    <div className="flex justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground/90">Drafting Agreement</h3>
                    <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">AI is assembling the NDA contract with terms covering intellectual property, milestones, and dispute resolution...</p>
                  </div>
                )}

                {/* Generation error state */}
                {generateNda.isError && !generateNda.isPending && !nda && (
                  <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 shadow-sm">
                    <div className="flex items-start gap-3.5">
                      <div className="w-6 h-6 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0 mt-0.5 text-destructive">
                        <ShieldAlert className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-destructive">NDA Generation Failure</h4>
                        <p className="text-xs text-destructive/75 mt-1 leading-relaxed">
                          {(generateNda.error as any)?.data?.error ?? (generateNda.error as any)?.message ?? "An error occurred compiling terms. Please retry."}
                        </p>
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-bold"
                            onClick={() => generateNda.mutate({ data: { roomId } })}
                          >
                            Re-generate NDA
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sign error */}
                {signNda.isError && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>Failed to sign NDA: {(signNda.error as any)?.data?.error ?? "Please try again."}</span>
                  </div>
                )}

                {/* Empty state — no NDA, no pending, no error */}
                {!nda && !generateNda.isPending && !generateNda.isError && (
                  <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center space-y-4 bg-card/10 backdrop-blur-sm">
                    <div className="flex justify-center opacity-40">
                      <Lock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground/75">NDA Not Generated</p>
                    <p className="text-xs text-muted-foreground/50 leading-relaxed max-w-xs mx-auto">
                      Formulate a legal agreement for this workspace. This will establish confidentiality bounds prior to squad onboarding.
                    </p>
                    {isOwner ? (
                      <Button
                        size="sm"
                        onClick={() => generateNda.mutate({ data: { roomId } })}
                        disabled={generateNda.isPending}
                        className="font-bold shadow-sm"
                      >
                        Generate NDA Document
                      </Button>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/60 italic">Waiting for room administrator to initialize the NDA agreement.</p>
                    )}
                  </div>
                )}

                {/* NDA document */}
                {nda && !generateNda.isPending && (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3 bg-muted/20 border border-border/25 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full inline-block ${nda.status === "signed" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" : "bg-amber-400 shadow-sm shadow-amber-400/50"}`} />
                        <span className="text-xs font-bold text-foreground/90 capitalize">
                          {nda.status === "signed"
                            ? "Fully Signed & Executed"
                            : nda.status === "pending_signatures"
                            ? `${nda.signedBy?.length ?? 0} of 2 Signatures Received`
                            : "Draft Agreement"}
                        </span>
                      </div>
                      {isOwner && nda.status === "draft" && (
                        <button
                          onClick={() => generateNda.mutate({ data: { roomId } })}
                          className="text-xs font-bold text-primary/80 hover:text-primary transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="h-3 w-3" /> Regenerate Draft
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border/45 bg-card/30 overflow-hidden shadow-md backdrop-blur-sm relative">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border/25 bg-background/25">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 opacity-60" /> NDA AGREEMENT</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(nda.content ?? "").then(
                              () => toast.success("NDA contract copied to clipboard!"),
                              () => toast.error("Failed to copy")
                            );
                          }}
                          className="text-[10px] font-bold text-muted-foreground/80 hover:text-primary transition-all px-2.5 py-1 rounded-md border border-border/30 hover:border-primary/25 bg-background/45"
                        >
                          Copy Text
                        </button>
                      </div>
                      <div className="p-5 max-h-96 overflow-y-auto bg-background/40 font-mono text-xs text-muted-foreground/90 leading-relaxed whitespace-pre-wrap select-all">
                        {nda.content}
                      </div>
                    </div>

                    {nda.status !== "signed" && (
                      isSignedByMe ? (
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 text-center shadow-inner">
                          <span className="text-xs text-emerald-500 font-bold flex items-center justify-center gap-1.5"><CheckCircle className="h-4 w-4" /> You have signed this NDA</span>
                          {nda.status === "pending_signatures" && (
                            <p className="text-[11px] text-muted-foreground/75 mt-1 font-medium">Awaiting execution signature from matching talent countersignatures.</p>
                          )}
                        </div>
                      ) : (
                        <Button
                          className="w-full font-bold shadow-md hover:scale-[1.01] transition-transform"
                          onClick={() => signNda.mutate({ id: roomId })}
                          disabled={signNda.isPending}
                        >
                          {signNda.isPending ? (
                            <span className="flex items-center gap-2 justify-center">
                              <span className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent animate-spin" />
                              Signing Agreement...
                            </span>
                          ) : "Sign NDA"}
                        </Button>
                      )
                    )}

                    {nda.status === "signed" && (
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 text-center shadow-inner">
                        <span className="text-xs text-emerald-500 font-bold flex items-center justify-center gap-1.5"><CheckCircle className="h-4 w-4" /> Contract Fully Executed & Active</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {isOwner && allRolesFilled && room.status === "open" && (
            <div className="shrink-0 border-t border-border/35 p-3.5 bg-background/20">
              <Button
                className="w-full font-bold shadow-md hover:scale-[1.01] transition-transform flex items-center justify-center gap-1.5"
                onClick={() => assembleSquad.mutate({ id: roomId })}
                disabled={assembleSquad.isPending}
              >
                {assembleSquad.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                    Forming Squad...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Form Squad and Sign NDA
                  </>
                )}
              </Button>
            </div>
          )}
          {isOwner && room.status === "contracted" && (
            <div className="shrink-0 border-t border-border/35 p-3.5 bg-background/20">
              <button
                onClick={async () => {
                  if (!confirm("Close this room? This marks the project as complete.")) return;
                  try {
                    const token = localStorage.getItem("dehix_token");
                    const res = await fetch(`/api/rooms/${roomId}/close`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error("Failed to close room");
                    toast.success("Room closed successfully");
                    refetchRoom();
                  } catch {
                    toast.error("Failed to close room");
                  }
                }}
                className="w-full text-xs font-bold py-2 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-all shadow-sm"
              >
                Close Room
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Chat */}
        <div className="w-84 shrink-0 border-l border-border/30 flex flex-col overflow-hidden bg-card/15 backdrop-blur-sm">

          {/* Meet link */}
          <div className="shrink-0 border-b border-border/30 p-3 bg-background/15">
            {editingMeetLink ? (
              <div className="space-y-2 bg-card/60 p-2.5 border border-border/40 rounded-xl">
                <input
                  value={meetLinkInput}
                  onChange={(e) => setMeetLinkInput(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full bg-background border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 placeholder:text-muted-foreground/35 text-foreground/90 font-sans"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveMeetLink(); if (e.key === "Escape") { setEditingMeetLink(false); } }}
                />
                <div className="flex gap-2">
                  <button onClick={saveMeetLink} disabled={savingMeetLink} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50">
                    {savingMeetLink ? "Saving..." : "Save Link"}
                  </button>
                  <button onClick={() => setEditingMeetLink(false)} className="text-xs font-semibold py-1.5 px-3 rounded-lg text-muted-foreground hover:bg-muted/15 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : room.meetLink ? (
              <div className="flex items-center gap-2">
                <a href={room.meetLink} target="_blank" rel="noreferrer" className="flex-1 block">
                  <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 px-4 py-3 text-left hover:border-emerald-500/40 hover:bg-gradient-to-r hover:from-emerald-500/10 hover:to-teal-500/10 transition-all duration-200 shadow-sm flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0 group-hover:scale-105 transition-transform">
                      <Video className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        Google Meet
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5">Click to join video conference</div>
                    </div>
                  </div>
                </a>
                {isBusiness && (
                  <button onClick={() => { setMeetLinkInput(room.meetLink ?? ""); setEditingMeetLink(true); }} className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/20 p-2 rounded-lg transition-all text-xs shrink-0" title="Edit meet link">✎</button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/45 bg-background/25 px-4 py-3.5 flex items-center justify-between shadow-sm">
                <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Video className="h-3.5 w-3.5 opacity-60" /> No video link set</div>
                {isBusiness && (
                  <button onClick={() => { setMeetLinkInput(""); setEditingMeetLink(true); }} className="text-xs font-bold text-primary hover:text-indigo-400 bg-primary/10 border border-primary/20 rounded-md px-2 py-1 transition-all">+ Meet</button>
                )}
              </div>
            )}
          </div>

          {/* Chat header */}
          <div className="shrink-0 px-4 py-3 border-b border-border/30 flex items-center justify-between bg-background/20">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                {docMode ? (
                  <>
                    <Cpu className="h-3.5 w-3.5 text-primary" /> Range Select
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/70" /> Live Room Chat
                  </>
                )}
              </span>
              {docMode && (
                <span className="text-[9px] px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-bold animate-pulse">
                  Drafting
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {!docMode && chatMessages.length > 0 && (
                <button
                  onClick={summarizeChat}
                  disabled={summaryLoading}
                  title="AI Summarize conversation"
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-border/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all disabled:opacity-50"
                >
                  {summaryLoading ? "..." : "∑ Sum"}
                </button>
              )}
              {!docMode && (
                <button
                  onClick={() => { if (showActivity) { setShowActivity(false); } else { loadActivity(); } }}
                  title="Room activity feed logs"
                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                    showActivity
                      ? "border-primary/40 bg-primary/10 text-primary shadow-inner"
                      : "border-border/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  ⚡ Logs
                </button>
              )}
              <button
                onClick={() => { setDocMode(!docMode); setStartIdx(null); setEndIdx(null); setGenDocError(null); setChatSummary(null); setShowActivity(false); }}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                  docMode
                    ? "border-primary/45 bg-primary/15 text-primary hover:bg-primary/25"
                    : "border-border/40 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                }`}
              >
                {docMode ? "✕ Exit" : "Doc Mode"}
              </button>
            </div>
          </div>

          {/* Chat Summary panel */}
          {chatSummary && !docMode && (
            <div className="shrink-0 border-b border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Summary</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const text = [
                        chatSummary.summary,
                        chatSummary.keyDecisions?.length ? `\nKey Decisions:\n${chatSummary.keyDecisions.map(d => `• ${d}`).join("\n")}` : "",
                        chatSummary.actionItems?.length ? `\nAction Items:\n${chatSummary.actionItems.map(a => `→ ${a}`).join("\n")}` : "",
                      ].join("");
                      navigator.clipboard.writeText(text).then(() => toast.success("Summary copied!"), () => toast.error("Failed to copy"));
                    }}
                    className="text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors px-2 py-0.5 rounded border border-border/30 hover:border-primary/30 bg-background/55"
                  >
                    Copy
                  </button>
                  <button onClick={() => setChatSummary(null)} className="text-[11px] text-muted-foreground hover:text-foreground">✕</button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/90 leading-relaxed bg-background/35 border border-border/25 rounded-xl p-3 shadow-inner">{chatSummary.summary}</p>
              {chatSummary.keyDecisions?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-bold text-muted-foreground/80 uppercase tracking-wider">Key Decisions</div>
                  {chatSummary.keyDecisions.map((d, i) => (
                    <div key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5 bg-background/15 px-2.5 py-1.5 rounded-lg border border-border/20">
                      <span className="text-primary mt-0.5">▪</span>
                      <span className="leading-snug">{d}</span>
                    </div>
                  ))}
                </div>
              )}
              {chatSummary.actionItems?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-bold text-muted-foreground/80 uppercase tracking-wider">Action Items</div>
                  {chatSummary.actionItems.map((a, i) => (
                    <div key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5 bg-background/15 px-2.5 py-1.5 rounded-lg border border-border/20">
                      <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                      <span className="leading-snug">{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity feed panel */}
          {showActivity && !docMode && (
            <div className="shrink-0 border-b border-amber-500/25 bg-amber-500/5 p-4 max-h-60 overflow-y-auto space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Room Activity Logs</span>
                <button onClick={() => setShowActivity(false)} className="text-[11px] text-muted-foreground hover:text-foreground">✕</button>
              </div>
              {activityFeed.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/50 text-center py-4 bg-background/10 rounded-xl">No events yet</p>
              ) : (
                <div className="space-y-2">
                  {activityFeed.map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-background/25 border border-border/30 rounded-xl p-2.5 hover:border-amber-500/15 transition-colors shadow-sm">
                      <span className="text-sm shrink-0 mt-0.5">{e.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-foreground/90 font-medium leading-snug">{e.label}</p>
                        <p className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">{new Date(e.at).toLocaleDateString()} {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Doc mode hint */}
          {docMode && startIdx === null && (
            <div className="shrink-0 px-4 py-3 bg-primary/5 border-b border-primary/10">
              <p className="text-[11px] text-primary/80 leading-relaxed flex items-start gap-1.5">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5 animate-pulse" />
                <span>
                  Select a range of messages by clicking <strong>Set Start</strong> on one bubble and <strong>Set End</strong> on another to assemble an AI document.
                </span>
              </p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-10 space-y-2.5">
                <div className="flex justify-center opacity-30">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground/50 font-medium">
                  {docMode ? "No messages to select yet" : "No messages. Start the thread!"}
                </p>
                {!isFirebaseEnabled && !docMode && (
                  <p className="text-[10px] text-muted-foreground/35 leading-relaxed max-w-[180px] mx-auto">
                    Chat is session-only without Firebase persistence.
                  </p>
                )}
              </div>
            )}

            {chatMessages.map((msg, idx) => {
              const lo = startIdx !== null && endIdx !== null ? Math.min(startIdx, endIdx) : null;
              const hi = startIdx !== null && endIdx !== null ? Math.max(startIdx, endIdx) : null;
              const inRange = lo !== null && hi !== null && idx >= lo && idx <= hi;
              const isStart = startIdx === idx;
              const isEnd = endIdx === idx;
              
              const isCurrentUser = msg.userId === user?._id;
              
              if (msg.isAi) {
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[88%] mr-auto rounded-2xl rounded-tl-sm p-3.5 text-xs bg-primary/5 border hover:border-primary/25 transition-all shadow-sm text-left flex flex-col gap-1.5 relative overflow-hidden ${
                      inRange ? "border-primary/45 ring-2 ring-primary/15 bg-primary/10" : "border-primary/15"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5 select-none">
                      <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider flex items-center gap-0.5">
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                      <span className="text-[11px] font-bold text-primary">DEHIX AI</span>
                      {inRange && (
                        <span className="text-[9px] text-primary/60 font-mono ml-auto">Range #{idx - (lo ?? 0) + 1}</span>
                      )}
                    </div>
                    
                    <div className="text-foreground/90 leading-relaxed"><MarkdownMini text={msg.message} /></div>
                    
                    {docMode && (
                      <div className="flex gap-1.5 mt-2 pt-2 border-t border-border/10">
                        <button
                          onClick={() => setStartIdx(idx)}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                            isStart
                              ? "bg-primary text-white"
                              : "bg-primary/10 text-primary/80 hover:bg-primary/20"
                          }`}
                        >
                          {isStart ? "▶ Start" : "Set Start"}
                        </button>
                        <button
                          onClick={() => setEndIdx(idx)}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                            isEnd
                              ? "bg-primary text-white"
                              : "bg-primary/10 text-primary/80 hover:bg-primary/20"
                          }`}
                        >
                          {isEnd ? "◀ End" : "Set End"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Normal messages (right if current user, left if other)
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-xs transition-all duration-150 ${
                    isCurrentUser
                      ? "ml-auto rounded-tr-sm bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground shadow-md"
                      : "mr-auto rounded-tl-sm bg-card border border-border/30 text-foreground shadow-sm"
                  } ${
                    inRange
                      ? isCurrentUser
                        ? "ring-2 ring-primary/30 border border-white/30 bg-primary"
                        : "border-primary/45 ring-2 ring-primary/15 bg-primary/5"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 select-none">
                    <span className={`text-[10px] font-bold ${isCurrentUser ? "text-white/75" : "text-muted-foreground"}`}>
                      {msg.userName}
                    </span>
                    {inRange && (
                      <span className={`text-[9px] font-mono ml-auto ${isCurrentUser ? "text-white/60" : "text-primary/60"}`}>
                        Range #{idx - (lo ?? 0) + 1}
                      </span>
                    )}
                  </div>
                  
                  <p className={`leading-relaxed whitespace-pre-wrap ${isCurrentUser ? "text-white" : "text-foreground/90"}`}>
                    {msg.message}
                  </p>
                  
                  {docMode && (
                    <div className={`flex gap-1.5 mt-2 pt-2 border-t ${isCurrentUser ? "border-white/10" : "border-border/10"}`}>
                      <button
                        onClick={() => setStartIdx(idx)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                          isStart
                            ? isCurrentUser ? "bg-white text-primary" : "bg-primary text-white"
                            : isCurrentUser ? "bg-white/10 text-white hover:bg-white/20" : "bg-primary/10 text-primary/80 hover:bg-primary/20"
                        }`}
                      >
                        {isStart ? "▶ Start" : "Set Start"}
                      </button>
                      <button
                        onClick={() => setEndIdx(idx)}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                          isEnd
                            ? isCurrentUser ? "bg-white text-primary" : "bg-primary text-white"
                            : isCurrentUser ? "bg-white/10 text-white hover:bg-white/20" : "bg-primary/10 text-primary/80 hover:bg-primary/20"
                        }`}
                      >
                        {isEnd ? "◀ End" : "Set End"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI typing indicator */}
            {aiLoading && (
              <div className="max-w-[85%] mr-auto rounded-2xl rounded-tl-sm p-3.5 text-xs bg-primary/5 border border-primary/15 shadow-sm text-left flex flex-col gap-1.5 animate-pulse select-none">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider flex items-center gap-0.5"><Sparkles className="h-2 w-2" /> AI</span>
                  <span className="text-[11px] font-bold text-primary">DEHIX AI</span>
                </div>
                <div className="flex items-center gap-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Document generation controls */}
          {docMode && startIdx !== null && endIdx !== null && (
            <div className="shrink-0 border-t border-primary/25 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-primary font-bold">
                  {Math.abs(endIdx - startIdx) + 1} messages selected
                </span>
                <button
                  onClick={() => { setStartIdx(null); setEndIdx(null); setGenDocError(null); }}
                  className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear Selection
                </button>
              </div>

              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-background border border-border/55 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 text-foreground font-semibold"
              >
                <option value="pitch_deck">Pitch Deck</option>
                <option value="technical_deck">Technical Deck</option>
                <option value="bd_strategy">BD Strategy</option>
                <option value="sow">Statement of Work</option>
                <option value="project_brief">Project Brief</option>
                <option value="idea_validation_report">Idea Validation Report</option>
                <option value="business_requirement_document">Business Requirement Document</option>
                <option value="project_requirement_document">Project Requirement Document</option>
                <option value="mvp_scope_document">MVP Scope Document</option>
                <option value="technical_architecture_document">Technical Architecture Document</option>
                <option value="feature_list_document">Feature List Document</option>
                <option value="development_roadmap">Development Roadmap</option>
              </select>

              {genDocError && (
                <p className="text-[10px] text-destructive leading-relaxed font-semibold">{genDocError}</p>
              )}

              <Button
                size="sm"
                className="w-full text-xs h-8 font-bold shadow-md hover:scale-[1.01] transition-transform"
                onClick={handleGenerateDoc}
                disabled={genDocLoading}
              >
                {genDocLoading ? (
                  <span className="flex items-center gap-1.5 justify-center">
                    <span className="w-3.5 h-3.5 rounded-full border border-white/40 border-t-white animate-spin" />
                    Generating...
                  </span>
                ) : "Generate Document"}
              </Button>
            </div>
          )}

          {/* Chat input */}
          {!docMode && (
            <div className="shrink-0 border-t border-border/30 p-4 space-y-2 bg-background/15">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAi(); }
                }}
                placeholder="Ask anything… Enter to send to AI"
                className="w-full bg-background/55 border border-border/50 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-1 focus:ring-primary/45 focus:border-primary/55 placeholder:text-muted-foreground/35 resize-none text-foreground/90 min-h-[56px] transition-all font-sans"
                rows={2}
              />
              <Button
                size="sm"
                className="w-full text-xs h-8 font-bold shadow-md flex items-center justify-center gap-1.5"
                onClick={askAi}
                disabled={!chatInput.trim() || aiLoading}
              >
                {aiLoading ? (
                  <span className="flex items-center gap-1.5 justify-center">
                    <span className="w-3.5 h-3.5 rounded-full border border-white/40 border-t-white animate-spin" />
                    Thinking...
                  </span>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Ask AI
                  </>
                )}
              </Button>
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || aiLoading}
                className="w-full text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground/80 hover:underline transition-all block text-center py-1"
              >
                Send to room only (no AI)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Document modal */}
    <DocModal doc={generatedDoc} onClose={() => setGeneratedDoc(null)} />
    </>
  );
}
