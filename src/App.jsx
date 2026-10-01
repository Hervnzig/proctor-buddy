import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Copy, ExternalLink,
  Eye, FileText, Fingerprint, GraduationCap, Grid2X2, Laptop, Link2, LockKeyhole,
  LogOut, Monitor, MoreHorizontal, Plus, Radio, RefreshCw, Search, Shield,
  ShieldCheck, ShieldAlert, Sparkles, UserRound, Users, Video, Webcam, X
} from "lucide-react";

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
};

const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const statusLabel = (status) => ({ setup: "Setting up", "awaiting-review": "Needs review", approved: "In progress", ended: "Completed" }[status] || status);

export default function App() {
  const joinId = new URLSearchParams(location.search).get("join");
  return joinId ? <StudentJoin sessionId={joinId} /> : <LecturerDashboard />;
}

function LecturerDashboard() {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [session, setSession] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api("/sessions");
      setSessions(data);
      const id = selectedId || data[0]?.id;
      if (id) {
        setSelectedId(id);
        setSession(data.find((item) => item.id === id) || await api(`/sessions/${id}`));
      } else setSession(null);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 3000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);

  const filtered = sessions.filter((item) => `${item.title} ${item.lecturerName}`.toLowerCase().includes(search.toLowerCase()));
  const students = session?.students || [];
  const needsReview = students.filter((student) => student.status === "awaiting-review").length;
  const active = students.filter((student) => student.status === "approved").length;

  async function createSession(data) {
    const created = await api("/sessions", { method: "POST", body: JSON.stringify(data) });
    setSessions((old) => [created, ...old]);
    setSelectedId(created.id);
    setSession(created);
    setShowCreate(false);
    setToast("Assessment session created");
  }

  async function approveStudent(studentId, approved) {
    await api(`/sessions/${session.id}/students/${studentId}/approval`, {
      method: "PATCH", body: JSON.stringify({ approved, reviewer: "Lecturer" })
    });
    await refresh();
    setToast(approved ? "Student approved to begin" : "Review decision saved");
  }

  async function copyJoinLink() {
    if (!session) return;
    const url = `${location.origin}/?join=${session.id}`;
    await navigator.clipboard.writeText(url);
    setToast("Student join link copied");
  }

  async function endAssessment() {
    if (!session || !window.confirm("End this assessment? Students will no longer be able to join.")) return;
    await api(`/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) });
    await refresh();
    setToast("Assessment ended. Reports remain available.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={19} /></div><span>verity<span className="brand-dot">.</span></span><span className="brand-tag">ASSESS</span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="nav-item active"><Grid2X2 size={17} /> Overview</button>
        <button className="nav-item" onClick={() => setShowCreate(true)}><Radio size={17} /> Live sessions <span className="nav-count">{sessions.length}</span></button>
        <button className="nav-item" onClick={() => setToast("Reports are available within each session.")}><FileText size={17} /> Reports</button>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>Visit the proctor guide</span><ArrowUpRight size={15} /></div>
          <div className="profile"><div className="avatar lecturer-avatar">JM</div><div className="profile-copy"><strong>Jordan Miller</strong><span>Lecturer account</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div><div className="topbar-actions"><div className="secure-pill"><span className="secure-dot" /> Secure workspace</div><button className="icon-button" aria-label="Notifications" onClick={() => setToast("You’re all caught up.")}><Bell size={18} /><i /></button><div className="avatar lecturer-avatar small">JM</div></div></header>
        <div className="page-content">
          <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13} /> YOUR ASSESSMENT SPACE</div><h1>Good morning, Jordan <span className="wave">✳</span></h1><p className="subhead">A clear view of your assessments and the students in them.</p></div><button className="button-primary" onClick={() => setShowCreate(true)}><Plus size={17} /> New assessment</button></div>

          <section className="metric-grid">
            <Metric label="Live assessments" value={sessions.filter((item) => item.status === "live").length} note="Across your workspace" icon={<Radio size={17} />} accent="green" />
            <Metric label="Students in progress" value={active} note="Currently approved" icon={<Users size={17} />} accent="blue" />
            <Metric label="Awaiting your review" value={needsReview} note={needsReview ? "Action recommended" : "Nothing needs attention"} icon={<ShieldAlert size={17} />} accent={needsReview ? "amber" : "lilac"} />
          </section>

          <section className="session-section">
            <div className="section-heading"><div><h2>Assessment sessions</h2><p>Manage live proctoring and review session activity.</p></div><button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button></div>
            <div className="session-tabs"><button className="tab active">All sessions <span>{sessions.length}</span></button><button className="tab" onClick={() => setToast("Live sessions are shown in the session list.")}>Live</button><button className="tab" onClick={() => setToast("Reports are available when you select a session.")}>Recent reports</button><div className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an assessment" /></div></div>
            <div className="session-table-wrap">
              <table className="session-table"><thead><tr><th>ASSESSMENT</th><th>STATUS</th><th>STUDENTS</th><th>NEEDS REVIEW</th><th>STARTED</th><th /></tr></thead>
                <tbody>{loading ? <tr><td colSpan="6" className="empty-row">Loading sessions…</td></tr> : filtered.length ? filtered.map((item) => <tr className={selectedId === item.id ? "selected-row" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setSession(item); }}><td><div className="assessment-cell"><div className="assessment-icon"><BookOpen size={17} /></div><div><strong>{item.title}</strong><span>Hosted by {item.lecturerName}</span></div></div></td><td><StatusPill status={item.status} /></td><td><div className="student-stack">{(item.students || []).slice(0, 3).map((student, index) => <div className={`avatar student-avatar color-${index % 4}`} key={student.id}>{initials(student.studentName)}</div>)}<span>{item.students?.length || 0} joined</span></div></td><td><span className={item.students?.some((student) => student.status === "awaiting-review") ? "review-count has-review" : "review-count"}>{item.students?.filter((student) => student.status === "awaiting-review").length || 0}</span></td><td className="time-cell">{formatTime(item.createdAt)}</td><td><button className="row-arrow" aria-label="Select session"><ArrowRight size={16} /></button></td></tr>) : <tr><td colSpan="6" className="empty-row"><div className="empty-state"><div className="empty-icon"><BookOpen size={22} /></div><strong>No assessment sessions yet</strong><span>Create your first session and share its student join link.</span><button className="button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Create session</button></div></td></tr>}</tbody>
              </table>
            </div>
          </section>

          {session && <SessionDetail session={session} onCopy={copyJoinLink} onApprove={approveStudent} onRefresh={refresh} onEnd={endAssessment} />}
          <footer className="page-footer"><span><LockKeyhole size={13} /> Student permission is always required for camera and screen access.</span><span>Verity MVP <span className="footer-sep">·</span> Local prototype</span></footer>
        </div>
      </main>
      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} onCreate={createSession} />}
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function Metric({ label, value, note, icon, accent }) {
  return <div className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-bottom"><strong>{value}</strong><span>{note}</span></div></div>;
}

function CreateSessionModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [lecturerName, setLecturerName] = useState("Jordan Miller");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onCreate({ title: title.trim(), lecturerName: lecturerName.trim() }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card" onSubmit={submit}><div className="modal-top"><div className="modal-symbol"><Plus size={19} /></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div><h2>Start an assessment</h2><p>Create a monitored session, then share its private join link with your class.</p><label className="field-label">Assessment name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology · Unit 4 quiz" required /></label><label className="field-label">Lecturer name<input value={lecturerName} onChange={(event) => setLecturerName(event.target.value)} required /></label>{error && <div className="form-error">{error}</div>}<div className="modal-foot"><span><Shield size={14} /> Students choose to enable each device.</span><button className="button-primary" disabled={busy}>{busy ? "Creating…" : "Create session"}<ArrowRight size={16} /></button></div></form></div>;
}

function SessionDetail({ session, onCopy, onApprove, onRefresh, onEnd }) {
  const students = session.students || [];
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || null);
  const selected = students.find((student) => student.id === selectedStudentId) || students[0] || null;
  useEffect(() => { if (!students.find((student) => student.id === selectedStudentId)) setSelectedStudentId(students[0]?.id || null); }, [students, selectedStudentId]);
  function downloadReport() {
    const report = {
      assessment: { id: session.id, title: session.title, lecturerName: session.lecturerName, status: session.status, createdAt: session.createdAt, endedAt: session.endedAt || null },
      exportedAt: new Date().toISOString(),
      students: session.students.map(({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckShots, events }) => ({ id, studentName, studentNumber, status, consentAt, joinedAt, approvedAt, approvedBy, precheckShots, events }))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `verity-${session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <section className="detail-section"><div className="section-heading detail-heading"><div><div className="eyebrow"><Radio size={12} /> {session.status === "live" ? "LIVE SESSION" : "COMPLETED SESSION"}</div><h2>{session.title}</h2><p>Started {new Date(session.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} <span className="bullet">·</span> {students.length} student{students.length === 1 ? "" : "s"} joined</p></div><div className="detail-actions">{session.status === "live" && <button className="button-secondary" onClick={onEnd}><X size={14} /> End assessment</button>}<button className="button-secondary" onClick={downloadReport}><FileText size={14} /> Export report</button><button className="button-secondary" onClick={onCopy}><Link2 size={15} /> Copy join link</button><button className="button-primary compact" onClick={onRefresh}><RefreshCw size={15} /> Update</button></div></div>
    <div className="join-banner"><div className="join-banner-icon"><Link2 size={18} /></div><div><strong>Invite students to join</strong><span>Anyone with this link can request access to this assessment.</span></div><button onClick={onCopy}><Copy size={15} /> Copy invite link</button></div>
    {!students.length ? <div className="session-empty"><div className="empty-icon"><Users size={21} /></div><strong>Waiting for students to join</strong><span>Share the link above. Each student will have a separate review and activity log.</span></div> : <div className="detail-content"><div className="student-list"><div className="list-title">STUDENT SESSIONS <span>{students.length}</span></div>{students.map((student, index) => <button key={student.id} className={`student-list-item ${selected?.id === student.id ? "chosen" : ""}`} onClick={() => setSelectedStudentId(student.id)}><div className={`avatar student-avatar color-${index % 4}`}>{initials(student.studentName)}</div><span className="student-list-copy"><strong>{student.studentName}</strong><small>{student.studentNumber}</small></span><StatusDot status={student.status} /></button>)}</div>
      {selected ? <StudentReport session={session} student={selected} onApprove={onApprove} /> : null}</div>}
  </section>;
}

function StudentReport({ session, student, onApprove }) {
  const [activeTab, setActiveTab] = useState("Overview");
  return <div className="report-panel"><div className="report-person"><div><div className="report-heading"><div className="avatar student-avatar color-2 large">{initials(student.studentName)}</div><div><h3>{student.studentName}</h3><span>{student.studentNumber} <span className="bullet">·</span> Joined {formatTime(student.joinedAt)}</span></div></div></div><StatusPill status={student.status} /></div>
    <div className="report-tabs">{["Overview", "Activity log"].map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}{tab === "Activity log" && <span>{student.events?.length || 0}</span>}</button>)}</div>
    {activeTab === "Overview" ? <><LiveFeeds sessionId={session.id} student={student}/><div className="evidence-heading"><div><h4>Workspace check</h4><span>Student-submitted background scan</span></div><span className="evidence-count">{student.precheckShots?.length || 0} images</span></div><div className="scan-grid">{student.precheckShots?.length ? student.precheckShots.map((shot) => <div className="scan-shot" key={shot.label}><img src={shot.imageDataUrl} alt={`${shot.label} room scan`} /><span>{shot.label}</span></div>) : <div className="no-evidence"><Webcam size={18} /> Background scan has not been submitted.</div>}</div><div className="review-bar"><div className="review-bar-copy"><ShieldCheck size={17}/><span>{student.status === "awaiting-review" ? "Review the check before allowing the quiz to begin." : student.status === "approved" ? "Student has been approved for this session." : "Student is completing their device setup."}</span></div>{student.status === "awaiting-review" && <div className="review-buttons"><button className="button-secondary" onClick={() => onApprove(student.id, false)}>Hold for review</button><button className="button-primary compact" onClick={() => onApprove(student.id, true)}><Check size={15}/> Approve student</button></div>}</div></> : <EventTimeline events={student.events || []} />}
  </div>;
}

function LiveFeeds({ sessionId, student }) {
  const screenRef = useRef(null);
  const cameraRef = useRef(null);
  const [screenState, setScreenState] = useState("Connecting");
  const [cameraState, setCameraState] = useState("Connecting");
  useEffect(() => {
    if (student.status !== "approved") {
      const notReady = student.status === "awaiting-review" ? "Waiting for approval" : "Not started";
      setScreenState(notReady); setCameraState(notReady); return;
    }
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${wsProto}//${location.host}/signaling?sessionId=${sessionId}&studentId=${student.id}`);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const queuedCandidates = [];
    let streamIds = {};
    let greetingTimer;
    pc.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate })); };
    pc.ontrack = (event) => {
      const settings = event.track.getSettings();
      const streamId = event.streams[0]?.id;
      const screenTrack = streamIds.screen === streamId || Boolean(settings.displaySurface) || /screen|display|window|tab/i.test(event.track.label);
      const target = screenTrack ? screenRef.current : cameraRef.current;
      if (target && event.streams[0]) target.srcObject = event.streams[0];
      if (screenTrack) setScreenState("Live feed"); else setCameraState("Live feed");
    };
    pc.onconnectionstatechange = () => { if (["disconnected", "failed", "closed"].includes(pc.connectionState)) { setScreenState("Reconnecting"); setCameraState("Reconnecting"); } };
    socket.onopen = () => { socket.send(JSON.stringify({ type: "lecturer-ready" })); greetingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "lecturer-ready" })); }, 1200); };
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "student-ready") { streamIds = { camera: message.cameraStreamId, screen: message.screenStreamId }; setScreenState("Connecting"); setCameraState("Connecting"); }
      if (message.type === "offer") {
        await pc.setRemoteDescription(message.offer);
        for (const candidate of queuedCandidates.splice(0)) await pc.addIceCandidate(candidate);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.send(JSON.stringify({ type: "answer", answer }));
      } else if (message.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else queuedCandidates.push(message.candidate);
      } else if (message.type === "student-ready") {
        setState("Connecting");
      }
    };
    return () => { clearInterval(greetingTimer); socket.close(); pc.close(); };
  }, [sessionId, student.id, student.status]);
  return <div className="media-grid">{[["screen", "Shared screen", screenState, screenRef], ["camera", "Webcam", cameraState, cameraRef]].map(([kind, title, state, ref]) => <div className="media-tile" key={kind}><div className="media-title">{kind === "screen" ? <Monitor size={14}/> : <Video size={14}/>} {title}<span className="media-live"><i />{state}</span></div><div className="media-frame">{state === "Live feed" ? <video ref={ref} autoPlay playsInline muted={kind === "screen"} /> : <div className="media-placeholder">{kind === "screen" ? <Monitor size={24}/> : <Video size={24}/>}<span>{state}</span></div>}</div></div>)}</div>;
}

function EventTimeline({ events }) {
  const ordered = [...events].reverse();
  return <div className="timeline-wrap">{ordered.length ? <div className="timeline">{ordered.map((event) => <div className="timeline-item" key={event.id}><div className={`timeline-icon ${event.type.includes("stop") || event.type.includes("warning") ? "attention" : ""}`}>{event.type.includes("screen") ? <Monitor size={14}/> : event.type.includes("camera") || event.type.includes("scan") ? <Webcam size={14}/> : <Activity size={14}/>}</div><div className="timeline-body"><strong>{eventTitle(event.type)}</strong><p>{event.payload?.message || event.payload?.detail || event.type.replaceAll("-", " ")}</p>{event.payload?.imageDataUrl && <img className="event-evidence" src={event.payload.imageDataUrl} alt="Incident screenshot"/>}</div><time>{formatTime(event.timestamp)}</time></div>)}</div> : <div className="no-evidence"><Activity size={18}/> No activity has been recorded yet.</div>}</div>;
}

function StudentJoin({ sessionId }) {
  const [session, setSession] = useState(null);
  const [student, setStudent] = useState(null);
  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [consented, setConsented] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [shots, setShots] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const cameraRef = useRef(null);
  const screenRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => { api(`/sessions/${sessionId}`).then(setSession).catch((err) => setError(err.message)); }, [sessionId]);
  useEffect(() => { if (cameraRef.current && cameraStream) cameraRef.current.srcObject = cameraStream; }, [cameraStream]);
  useEffect(() => { if (screenRef.current && screenStream) screenRef.current.srcObject = screenStream; }, [screenStream]);
  useEffect(() => () => { cameraStream?.getTracks().forEach((track) => track.stop()); screenStream?.getTracks().forEach((track) => track.stop()); }, [cameraStream, screenStream]);

  useEffect(() => {
    if (!student || !session || !["awaiting-review", "approved"].includes(student.status)) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api(`/sessions/${session.id}`);
        const current = latest.students.find((entry) => entry.id === student.id);
        if (current) {
          setStudent(current);
          if (current.status === "ended") {
            cameraStream?.getTracks().forEach((track) => track.stop());
            screenStream?.getTracks().forEach((track) => track.stop());
          }
        }
      } catch { /* retry on next poll */ }
    }, 2500);
    return () => clearInterval(interval);
  }, [student?.id, student?.status, session?.id, cameraStream, screenStream]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${wsProto}//${location.host}/signaling?sessionId=${sessionId}&studentId=${student.id}`);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const queuedCandidates = [];
    let greetingTimer;
    let offerStarted = false;
    cameraStream?.getTracks().forEach((track) => pc.addTrack(track, cameraStream));
    screenStream?.getTracks().forEach((track) => pc.addTrack(track, screenStream));
    pc.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate })); };
    const announceStudent = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "student-ready", cameraStreamId: cameraStream?.id, screenStreamId: screenStream?.id })); };
    socket.onopen = () => { announceStudent(); greetingTimer = setInterval(announceStudent, 1200); };
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "lecturer-ready" && !offerStarted) {
        offerStarted = true;
        clearInterval(greetingTimer);
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: "offer", offer }));
      } else if (message.type === "answer") {
        await pc.setRemoteDescription(message.answer);
        for (const candidate of queuedCandidates.splice(0)) await pc.addIceCandidate(candidate);
      } else if (message.type === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate); else queuedCandidates.push(message.candidate);
      }
    };
    return () => { clearInterval(greetingTimer); socket.close(); pc.close(); };
  }, [student?.id, student?.status, sessionId, cameraStream, screenStream]);

  useEffect(() => {
    if (!student || student.status !== "approved") return;
    const record = (type, payload = {}) => {
      api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type, payload }) }).catch(() => {});
      setEventCount((count) => count + 1);
    };
    record("assessment-monitoring-started");
    const onVisibility = () => { if (document.visibilityState === "hidden") record("session-tab-hidden", { detail: "The proctoring page became hidden." }); };
    document.addEventListener("visibilitychange", onVisibility);
    const screenTrack = screenStream?.getVideoTracks()[0];
    const onEnded = () => {
      const imageDataUrl = captureFrame(screenRef.current, canvasRef.current);
      record("screen-sharing-stopped", { message: "Student screen sharing stopped.", imageDataUrl });
      setError("Screen sharing stopped. Re-share your screen to continue.");
      setScreenStream(null);
    };
    screenTrack?.addEventListener("ended", onEnded);
    const timer = setInterval(() => record("monitoring-heartbeat", { cameraEnabled: Boolean(cameraStream?.active), screenEnabled: Boolean(screenStream?.active) }), 15000);
    return () => { document.removeEventListener("visibilitychange", onVisibility); screenTrack?.removeEventListener("ended", onEnded); clearInterval(timer); };
  }, [student?.id, student?.status, sessionId, cameraStream, screenStream]);

  async function join() {
    if (!studentName.trim() || !studentNumber.trim() || !consented) return;
    setBusy(true); setError("");
    try {
      const result = await api(`/sessions/${sessionId}/students`, { method: "POST", body: JSON.stringify({ studentName: studentName.trim(), studentNumber: studentNumber.trim() }) });
      setStudent(result);
      await api(`/sessions/${sessionId}/students/${result.id}`, { method: "PATCH", body: JSON.stringify({ consentAt: new Date().toISOString(), status: "setup" }) });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function enableCamera() {
    try { setError(""); const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }); setCameraStream(stream); await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ cameraReady: true }) }); }
    catch (err) { setError(`Camera access was not granted: ${err.message}`); }
  }

  async function shareScreen() {
    try { setError(""); const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); setScreenStream(stream); await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ screenReady: true }) }); }
    catch (err) { setError(`Screen sharing was not started: ${err.message}`); }
  }

  function capture(label) {
    const imageDataUrl = captureFrame(cameraRef.current, canvasRef.current);
    if (!imageDataUrl) { setError("Camera is not ready to capture an image yet."); return; }
    setShots((old) => ({ ...old, [label]: { label, imageDataUrl, timestamp: new Date().toISOString() } }));
  }

  async function submitScan() {
    if (Object.keys(shots).length < 3 || !cameraStream || !screenStream) return;
    setBusy(true); setError("");
    try {
      const result = await api(`/sessions/${sessionId}/students/${student.id}/precheck`, { method: "POST", body: JSON.stringify({ shots: ["left", "center", "right"].map((label) => shots[label]) }) });
      setStudent(result); setSaved(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function endSession() {
    if (!student) return;
    try { await api(`/sessions/${sessionId}/students/${student.id}/events`, { method: "POST", body: JSON.stringify({ type: "student-ended-session" }) }); await api(`/sessions/${sessionId}/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) }); } catch { /* local exit still works */ }
    cameraStream?.getTracks().forEach((track) => track.stop()); screenStream?.getTracks().forEach((track) => track.stop());
    location.href = "/";
  }

  if (error && !session) return <StudentShell><div className="student-error"><ShieldAlert size={26}/><h2>We couldn’t open this assessment</h2><p>{error}</p><a className="button-secondary" href="/">Return to home</a></div></StudentShell>;
  if (!session) return <StudentShell><div className="student-loading">Loading assessment details…</div></StudentShell>;
  if (session.status !== "live") return <StudentShell><div className="student-error"><Clock3 size={26}/><h2>This assessment isn’t open</h2><p>Ask your lecturer if you think you should have access.</p></div></StudentShell>;

  if (!student) return <StudentShell><div className="student-join-card"><div className="student-symbol"><GraduationCap size={22}/></div><div className="eyebrow">ASSESSMENT INVITATION</div><h1>{session.title}</h1><p className="student-intro">Hosted by {session.lecturerName}. Join to complete your device check and request access to begin.</p><div className="privacy-callout"><LockKeyhole size={17}/><span>Your lecturer will see your screen and webcam only after you choose to share them. You can stop sharing anytime.</span></div><label className="field-label">Your name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="First and last name" /></label><label className="field-label">Student number<input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} placeholder="Your class ID" /></label><label className="consent-check"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I understand that my lecturer will review the session activity and the background images I submit.</span></label>{error && <div className="form-error">{error}</div>}<button className="button-primary full-button" onClick={join} disabled={busy || !studentName.trim() || !studentNumber.trim() || !consented}>{busy ? "Joining…" : "Continue to device check"}<ArrowRight size={16}/></button><div className="student-safe-note"><ShieldCheck size={14}/> Permission is requested by your browser, not granted silently.</div></div></StudentShell>;

  const allShots = Object.keys(shots).length === 3;
  const isApproved = student.status === "approved";
  return <StudentShell><div className="student-workspace"><div className="student-topline"><a className="student-brand" href="/"><span className="brand-mark"><ShieldCheck size={17}/></span>verity<span className="brand-dot">.</span></a><div className="student-session-tag"><span className={`secure-dot ${isApproved ? "" : "amber-dot"}`}/>{isApproved ? "Proctoring active" : "Pre-assessment check"}</div><button className="student-exit" onClick={endSession}><LogOut size={15}/> Exit</button></div>
    <div className="student-main"><div className="student-progress"><span className="done"><Check size={12}/> Join</span><i/><span className={student.status !== "setup" ? "done" : "current"}>{student.status !== "setup" ? <Check size={12}/> : "2"} Setup</span><i/><span className={isApproved ? "done" : student.status === "awaiting-review" ? "current" : ""}>{isApproved ? <Check size={12}/> : "3"} Review</span><i/><span className={isApproved ? "current" : ""}>Quiz</span></div>
      {student.status === "ended" ? <div className="awaiting-card"><div className="waiting-icon"><CheckCircle2 size={24}/></div><div className="eyebrow">SESSION CLOSED</div><h1>This assessment has ended</h1><p>Your camera and screen sharing have been stopped. Contact your lecturer if you need help.</p></div> : isApproved ? <div className="approved-view">{error && <div className="form-error student-form-error"><ShieldAlert size={15}/><span>{error}</span><button className="button-secondary" onClick={shareScreen}>Share again</button></div>}<div className="approval-success"><div className="success-ring"><CheckCircle2 size={31}/></div><div className="eyebrow">YOU’RE ALL SET</div><h1>Session approved</h1><p>Your lecturer has approved your setup. Keep this tab open and leave screen sharing enabled during your quiz.</p></div><div className="live-preview-grid"><div className="live-preview-card"><div><Monitor size={15}/> Shared screen <span className="live-label"><i/>LIVE</span></div><video ref={screenRef} autoPlay playsInline muted /></div><div className="live-preview-card"><div><Video size={15}/> Webcam <span className="live-label"><i/>LIVE</span></div><video ref={cameraRef} autoPlay playsInline muted /></div></div><div className="monitoring-card"><div className="monitoring-symbol"><Activity size={19}/></div><div><strong>Monitoring is active</strong><span>Your lecturer can see the shared screen and webcam feed. Session activity is logged.</span></div><span className="event-counter">{eventCount} events</span></div><div className="student-quiz-note"><BookOpen size={17}/><span><strong>Ready for your quiz?</strong><br/>Open your quiz in a new tab or window. Keep screen sharing active.</span><ArrowUpRight size={16}/></div><button className="button-secondary full-button end-button" onClick={endSession}>End monitored session</button></div> : student.status === "awaiting-review" ? <div className="awaiting-card"><div className="waiting-icon"><Clock3 size={24}/></div><div className="eyebrow">SETUP SUBMITTED</div><h1>Waiting for your lecturer</h1><p>Your background check has been submitted. Your lecturer will review it before you can start.</p><div className="waiting-progress"><span/><span/><span className="pulse-dot"/></div><small>This page will update automatically after the review.</small></div> : <div className="setup-content"><div className="setup-intro"><div className="eyebrow">STEP 2 OF 4 · DEVICE CHECK</div><h1>Set up your space</h1><p>Enable your camera and share your screen. Then scan your workspace so your lecturer can review it before the quiz.</p></div><div className="device-grid"><div className={`device-card ${cameraStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon"><Video size={18}/></div><span className={cameraStream ? "device-status ready" : "device-status"}><i/>{cameraStream ? "Enabled" : "Not enabled"}</span></div><h3>Webcam</h3><p>Allow camera access so your lecturer can see you during the assessment.</p>{cameraStream ? <div className="mini-video"><video ref={cameraRef} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Camera preview</span></div> : <button className="button-secondary device-button" onClick={enableCamera}><Video size={15}/> Enable webcam</button>}</div><div className={`device-card ${screenStream ? "device-ready" : ""}`}><div className="device-card-head"><div className="device-icon screen-icon"><Monitor size={18}/></div><span className={screenStream ? "device-status ready" : "device-status"}><i/>{screenStream ? "Sharing" : "Not sharing"}</span></div><h3>Screen share</h3><p>Choose the screen or window where you’ll complete your quiz.</p>{screenStream ? <div className="mini-video"><video ref={screenRef} autoPlay playsInline muted/><span><CheckCircle2 size={13}/> Screen preview</span></div> : <button className="button-secondary device-button" onClick={shareScreen}><Monitor size={15}/> Share your screen</button>}</div></div>
        <div className="scan-card"><div className="scan-card-heading"><div><div className="eyebrow">WORKSPACE CHECK</div><h2>Show your surroundings</h2><p>Use your webcam to capture left, center, and right views of your workspace.</p></div><div className="scan-count">{Object.keys(shots).length}<span>/3</span></div></div><div className="scan-capture-row">{[{ key: "left", label: "Left side", icon: <ArrowDownLeft size={16}/> }, { key: "center", label: "Straight ahead", icon: <UserRound size={16}/> }, { key: "right", label: "Right side", icon: <ArrowDownLeft className="flip-icon" size={16}/> }].map((item) => <button className={`capture-tile ${shots[item.key] ? "captured" : ""}`} key={item.key} disabled={!cameraStream} onClick={() => capture(item.key)}>{shots[item.key] ? <img src={shots[item.key].imageDataUrl} alt={`${item.label} scan`}/> : <span className="capture-placeholder">{item.icon}</span>}<span className="capture-label">{shots[item.key] ? <CheckCircle2 size={13}/> : null}{item.label}</span></button>)}</div><div className="scan-hint"><Eye size={15}/> Make sure your webcam can see the area around you. Images are shared with your lecturer for review.</div></div>
        {error && <div className="form-error student-form-error"><ShieldAlert size={15}/>{error}</div>}<div className="setup-footer"><div><LockKeyhole size={15}/><span>Camera and screen access can be stopped in your browser at any time.</span></div><button className="button-primary" onClick={submitScan} disabled={busy || !cameraStream || !screenStream || !allShots}>{busy ? "Submitting…" : "Submit setup for review"}<ArrowRight size={16}/></button></div></div>}
    </div><footer className="student-footer"><span><ShieldCheck size={14}/> Verity · Assessment workspace</span><a href="#" onClick={(event) => { event.preventDefault(); alert("Contact your lecturer for help with this assessment."); }}>Need help?</a></footer><canvas ref={canvasRef} width="720" height="405" hidden/></div></StudentShell>;
}

function StudentShell({ children }) { return <div className="student-shell">{children}</div>; }

function StatusPill({ status }) {
  const cls = status === "live" || status === "approved" ? "status-live" : status === "awaiting-review" ? "status-review" : status === "ended" ? "status-ended" : "status-setup";
  return <span className={`status-pill ${cls}`}><i/>{status === "live" ? "Live" : statusLabel(status)}</span>;
}
function StatusDot({ status }) { return <span className={`status-dot ${status === "awaiting-review" ? "needs" : status === "approved" ? "approved" : ""}`} title={statusLabel(status)} />; }
function initials(name = "") { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function eventTitle(type) { return ({ "assessment-monitoring-started": "Monitoring started", "monitoring-heartbeat": "Session active", "screen-sharing-stopped": "Screen sharing stopped", "session-tab-hidden": "Proctoring tab changed", "background-scan-submitted": "Background scan submitted", "student-approved": "Student approved", "approval-withheld": "Review held", "student-ended-session": "Session ended" }[type] || type.replaceAll("-", " ").replace(/^\w/, (letter) => letter.toUpperCase())); }
function captureFrame(video, canvas) {
  if (!video || !canvas || !video.videoWidth) return null;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.76);
}
