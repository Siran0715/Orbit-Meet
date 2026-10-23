
/* global StompJs */

// ============================================================
// OAuth2 → JWT HANDOFF
// ============================================================

const urlParams = new URLSearchParams(window.location.search);
const oauthToken = urlParams.get("token");

if (oauthToken) {
  localStorage.setItem("jwt", oauthToken);

  // Remove JWT from browser URL after storing it
  window.history.replaceState({}, document.title, "/");
}

// ============================================================
// WebSocket / WebRTC CONFIGURATION
// ============================================================

const WS_URL = "ws://localhost:8080/ws";

const DESTINATIONS = {
  chat: "/app/message",
  signal: "/app/webrtc",
};

const ICE_SERVERS = [
  {
    urls: "stun:stun.l.google.com:19302",
  },
  {
    urls: "stun:stun1.l.google.com:19302",
  },
];

const el = (id) => document.getElementById(id);

const state = {
  client: null,
  roomId: "",
  username: "",
  clientId: "",
  localStream: null,
  peers: new Map(),
  participants: new Map(),
  subscriptions: [],
  seenMessages: new Set(),
  joining: false,
  activePanel: "chat",
};

function uniqueRoomId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `orbit-${window.crypto.randomUUID().slice(0, 8)}`;
  }

  return `orbit-${Math.random().toString(36).substring(2, 10)}`;
}

function uniqueClientId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function showFeedback(target, message, timeout = 3500) {
  const node = el(target);

  if (!node) {
    console.warn(`Feedback element not found: ${target}`);
    return;
  }

  node.textContent = message;

  if (timeout) {
    setTimeout(() => {
      if (node.textContent === message) {
        node.textContent = "";
      }
    }, timeout);
  }
}

function initials(name) {
  return (name || "?")
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
}

function validateName() {
  const name = safeText(el("usernameInput")?.value);

  if (!name) {
    showFeedback("landingFeedback", "Please enter a display name.");
    return null;
  }

  return name;
}

async function createMeeting() {
  const name = validateName();

  if (!name) {
    return;
  }

  const room = uniqueRoomId();

  const createdRoomId = el("createdRoomId");

  if (createdRoomId) {
    createdRoomId.textContent = room;
  }

  const createdRoomBox = el("createdRoomBox");

  if (createdRoomBox) {
    createdRoomBox.classList.remove("hidden");
  }

  await enterMeeting(room, name);
}

async function joinMeeting() {
  const name = validateName();
  const room = safeText(el("roomIdInput")?.value);

  if (!name) {
    return;
  }

  if (!room) {
    showFeedback("landingFeedback", "Enter the Room ID you were given.");
    return;
  }

  await enterMeeting(room, name);
}

async function enterMeeting(roomId, username) {
  if (state.joining) {
    return;
  }

  state.joining = true;

  try {
    state.roomId = roomId;
    state.username = username;
    state.clientId = uniqueClientId();

    await startLocalMedia();

    el("landingScreen")?.classList.add("hidden");
    el("meetingScreen")?.classList.remove("hidden");

    if (el("roomIdLabel")) {
      el("roomIdLabel").textContent = roomId;
    }

    addParticipant(state.clientId, username, true);
    addVideoCard(state.clientId, username, state.localStream, true);

    await connectStomp();

    publish(DESTINATIONS.chat, {
      roomId: state.roomId,
      sender: state.username,
      content: "",
      type: "JOIN",
    });

    publishSignal("join");

    showFeedback("meetingFeedback", "You are in the meeting.");
  } catch (error) {
    console.error("Meeting entry error:", error);

    showFeedback(
        "landingFeedback",
        `Could not join meeting: ${
  error.message || "camera or connection unavailable"
}`,
        6000,
    );

    await cleanup(false);
  } finally {
    state.joining = false;
  }
}

async function startLocalMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera and microphone are not supported.");
  }

  state.localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
}

function connectStomp() {
  return new Promise((resolve, reject) => {
    if (!window.StompJs) {
      reject(new Error("Messaging library failed to load."));
      return;
    }

    const token = localStorage.getItem("jwt");

    if (!token) {
      reject(new Error("JWT token not found. Please login first."));
      return;
    }

    state.client = new StompJs.Client({
      brokerURL: WS_URL,

      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },

      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
    });

    let settled = false;

    const failTimer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error("WebSocket connection timed out."));
    }, 10000);

    state.client.onConnect = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(failTimer);

      const chatSubscription = state.client.subscribe(
          `/topic/room/${state.roomId}/messages`,
handleChatFrame,
);

const allSubscription = state.client.subscribe(
    `/topic/webrtc/${state.roomId}/all`,
    handleSignalFrame,
);

const directSubscription = state.client.subscribe(
    `/topic/webrtc/${state.roomId}/${state.clientId}`,
    handleSignalFrame,
);

state.subscriptions = [
  chatSubscription,
  allSubscription,
  directSubscription,
];

resolve();
};

state.client.onStompError = (frame) => {
  if (settled) {
    return;
  }

  settled = true;
  clearTimeout(failTimer);

  reject(
      new Error(frame.headers?.message || "STOMP connection rejected."),
  );
};

state.client.onWebSocketError = () => {
  if (settled) {
    return;
  }

  settled = true;
  clearTimeout(failTimer);

  reject(new Error("Cannot reach the meeting server."));
};

state.client.activate();
});
}

function publish(destination, body) {
  if (state.client && state.client.connected) {
    state.client.publish({
      destination,
      body: JSON.stringify(body),
    });
  }
}

function publishSignal(type, target = null, data = {}) {
  publish(DESTINATIONS.signal, {
    roomId: state.roomId,
    sender: state.clientId,
    senderName: state.username,
    target,
    type,
    ...data,
  });
}

function handleSignalFrame(frame) {
  let message;

  try {
    message = JSON.parse(frame.body);
  } catch (error) {
    console.error("Invalid WebRTC message:", error);
    return;
  }

  handleSignal(message);
}

async function handleSignal(message) {
  try {
    const roomId = message.roomId || message.room;
    const sender = message.sender || message.clientId || message.from;
    const target = message.target || message.to || null;

    if (!roomId || roomId !== state.roomId) {
      return;
    }

    if (!sender || sender === state.clientId) {
      return;
    }

    if (target && target !== state.clientId) {
      return;
    }

    const type = String(
        message.type || message.signalType || "",
    ).toLowerCase();

    const name =
        safeText(message.senderName || message.username || message.name) ||
        "Guest";

    if (type === "join") {
      addParticipant(sender, name);
      await createPeer(sender, name, true);
      return;
    }

    if (type === "leave") {
      removePeer(sender);
      return;
    }

    addParticipant(sender, name);

    if (type === "offer") {
      const peer = await createPeer(sender, name, false);

      const offer = message.sdp || message.offer;

      if (!offer) {
        return;
      }

      await peer.pc.setRemoteDescription(
          new RTCSessionDescription(offer),
      );

      peer.remoteDescriptionSet = true;

      await flushCandidates(peer);

      const answer = await peer.pc.createAnswer();

      await peer.pc.setLocalDescription(answer);

      publishSignal("answer", sender, {
        sdp: peer.pc.localDescription,
      });

      return;
    }

    if (type === "answer") {
      const peer = state.peers.get(sender);

      if (!peer) {
        return;
      }

      const answer = message.sdp || message.answer;

      if (!answer) {
        return;
      }

      await peer.pc.setRemoteDescription(
          new RTCSessionDescription(answer),
      );

      peer.remoteDescriptionSet = true;

      await flushCandidates(peer);

      return;
    }

    if (
        type === "candidate" ||
        type === "ice-candidate" ||
        type === "ice"
    ) {
      const peer = await createPeer(sender, name, false);

      const candidate =
          message.candidate || message.iceCandidate;

      if (!candidate) {
        return;
      }

      if (peer.remoteDescriptionSet) {
        await peer.pc.addIceCandidate(
            new RTCIceCandidate(candidate),
        );
      } else {
        peer.pendingCandidates.push(candidate);
      }
    }
  } catch (error) {
    console.error("WebRTC signal handling error:", error);
  }
}

async function createPeer(id, name, initiator) {
  const existing = state.peers.get(id);

  if (existing) {
    return existing;
  }

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
  });

  const peer = {
    pc,
    pendingCandidates: [],
    remoteDescriptionSet: false,
    name,
  };

  state.peers.set(id, peer);

  addParticipant(id, name);

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, state.localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }

    publishSignal("candidate", id, {
      candidate: event.candidate.toJSON(),
    });
  };

  pc.ontrack = (event) => {
    const stream = event.streams && event.streams[0];

    if (!stream) {
      return;
    }

    addVideoCard(id, name, stream, false);
  };

  pc.onconnectionstatechange = () => {
    console.log(`Peer ${id} state:`, pc.connectionState);

    if (pc.connectionState === "failed") {
      removePeer(id);
    } else if (pc.connectionState === "closed") {
      removePeer(id);
    } else if (pc.connectionState === "disconnected") {
      setTimeout(() => {
        if (
            state.peers.has(id) &&
            pc.connectionState === "disconnected"
        ) {
          removePeer(id);
        }
      }, 5000);
    }
  };

  if (initiator) {
    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    publishSignal("offer", id, {
      sdp: pc.localDescription,
    });
  }

  return peer;
}

async function flushCandidates(peer) {
  while (peer.pendingCandidates.length > 0) {
    const candidate = peer.pendingCandidates.shift();

    try {
      await peer.pc.addIceCandidate(
          new RTCIceCandidate(candidate),
      );
    } catch (error) {
      console.error("ICE candidate error:", error);
    }
  }
}

function addVideoCard(id, name, stream, local) {
  let card = document.querySelector(
      `[data-peer-id="${CSS.escape(id)}"]`,
  );

  if (!card) {
    card = document.createElement("article");

    card.className = `video-card${local ? " local" : ""}`;
    card.dataset.peerId = id;

    const video = document.createElement("video");

    video.autoplay = true;
    video.playsInline = true;

    if (local) {
      video.muted = true;
    }

    const fallback = document.createElement("div");

    fallback.className = "video-fallback";

    const avatar = document.createElement("div");

    avatar.className = "avatar";
    avatar.textContent = initials(name);

    fallback.append(avatar);

    const label = document.createElement("div");

    label.className = "video-name";
    label.textContent = local ? `${name} (You)` : name;

    card.append(video, fallback, label);

    el("videoGrid").append(card);
  }

  const video = card.querySelector("video");

  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }

  card.classList.add("has-stream");

  video.play().catch(() => {});
}

function addParticipant(id, name, isLocal = false) {
  state.participants.set(id, {
    name,
    isLocal,
  });

  renderParticipants();
}

function removePeer(id) {
  const peer = state.peers.get(id);

  if (peer) {
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();

    state.peers.delete(id);
  }

  state.participants.delete(id);

  const card = document.querySelector(
      `[data-peer-id="${CSS.escape(id)}"]`,
  );

  if (card) {
    card.remove();
  }

  renderParticipants();
}

function renderParticipants() {
  const list = el("participantList");

  if (!list) {
    return;
  }

  list.replaceChildren();

  for (const [id, participant] of state.participants) {
    const item = document.createElement("li");

    item.className = "participant-item";

    const avatar = document.createElement("span");

    avatar.className = "participant-avatar";
    avatar.textContent = initials(participant.name);

    const name = document.createElement("span");

    name.textContent = participant.name;

    item.append(avatar, name);

    if (participant.isLocal || id === state.clientId) {
      const you = document.createElement("span");

      you.className = "you-tag";
      you.textContent = "(You)";

      item.append(you);
    }

    list.append(item);
  }

  const count = state.participants.size;

  if (el("participantCount")) {
    el("participantCount").textContent = count;
  }

  if (el("panelParticipantCount")) {
    el("panelParticipantCount").textContent = count;
  }
}

function handleChatFrame(frame) {
  let message;

  try {
    message = JSON.parse(frame.body);
  } catch {
    return;
  }

  if (message.roomId !== state.roomId) {
    return;
  }

  if (String(message.type || "").toUpperCase() !== "CHAT") {
    return;
  }

  const id =
      message.messageId ||
      message.id ||
      `${message.roomId}|${message.sender}|${message.content}|${
          message.timestamp || ""
      }`;

  if (state.seenMessages.has(id)) {
    return;
  }

  state.seenMessages.add(id);

  if (state.seenMessages.size > 500) {
    const first = state.seenMessages.values().next().value;
    state.seenMessages.delete(first);
  }

  renderChat(message);
}

function sendChat(event) {
  event.preventDefault();

  const input = el("chatInput");
  const content = safeText(input?.value);

  if (!content) {
    return;
  }

  if (!state.client || !state.client.connected) {
    showFeedback("meetingFeedback", "Not connected to server.");
    return;
  }

  const message = {
    roomId: state.roomId,
    sender: state.username,
    content,
    type: "CHAT",
    messageId: uniqueClientId(),
    timestamp: Date.now(),
  };

  publish(DESTINATIONS.chat, message);

  input.value = "";
}

function renderChat(message) {
  const mine = message.sender === state.username;

  const article = document.createElement("article");

  article.className = `message${mine ? " mine" : ""}`;

  const meta = document.createElement("div");

  meta.className = "message-meta";

  const author = document.createElement("strong");

  author.textContent = mine
      ? "You"
      : message.senderName ||
      message.username ||
      message.sender ||
      "Guest";

  meta.append(author);

  const body = document.createElement("div");

  body.className = "message-body";
  body.textContent = String(message.content || "");

  article.append(meta, body);

  const messages = el("chatMessages");

  if (!messages) {
    return;
  }

  messages.append(article);

  messages.scrollTop = messages.scrollHeight;
}

function toggleMic() {
  const track = state.localStream?.getAudioTracks()[0];

  if (!track) {
    return;
  }

  track.enabled = !track.enabled;

  setControl(
      "micBtn",
      !track.enabled,
      track.enabled ? "Mute" : "Unmute",
  );
}

function toggleCamera() {
  const track = state.localStream?.getVideoTracks()[0];

  if (!track) {
    return;
  }

  track.enabled = !track.enabled;

  setControl(
      "cameraBtn",
      !track.enabled,
      track.enabled ? "Camera" : "Camera off",
  );
}

function setControl(id, off, label) {
  const btn = el(id);

  if (!btn) {
    return;
  }

  btn.classList.toggle("off", off);

  btn.setAttribute("aria-pressed", String(off));

  const spans = btn.querySelectorAll("span");

  if (spans.length > 0) {
    spans[spans.length - 1].textContent = label;
  } else {
    btn.textContent = label;
  }
}

function openPanel(panel) {
  state.activePanel = panel;

  el("sidePanel")?.classList.remove("hidden");

  el("chatPanel")?.classList.toggle(
      "hidden",
      panel !== "chat",
  );

  el("participantsPanel")?.classList.toggle(
      "hidden",
      panel !== "participants",
  );

  document
      .querySelectorAll(".panel-tab[data-panel]")
      .forEach((btn) => {
        btn.classList.toggle(
            "active",
            btn.dataset.panel === panel,
        );
      });

  ["chatBtn", "participantsBtn"].forEach((id) => {
    el(id)?.classList.toggle(
        "active",
        id === `${panel}Btn`,
    );
  });
}

function closePanel() {
  el("sidePanel")?.classList.add("hidden");

  el("chatBtn")?.classList.remove("active");
  el("participantsBtn")?.classList.remove("active");
}

async function copyRoomId() {
  const room =
      state.roomId ||
      el("createdRoomId")?.textContent;

  if (!room) {
    return;
  }

  try {
    await navigator.clipboard.writeText(room);

    showFeedback(
        state.roomId
            ? "meetingFeedback"
            : "landingFeedback",
        "Room ID copied.",
    );
  } catch {
    showFeedback(
        state.roomId
            ? "meetingFeedback"
            : "landingFeedback",
        "Copy unavailable — select the Room ID manually.",
    );
  }
}

async function cleanup(returnToLanding = true) {
  try {
    if (
        state.client &&
        state.client.connected &&
        state.roomId
    ) {
      publishSignal("leave");
    }

    state.subscriptions.forEach((subscription) => {
      try {
        subscription.unsubscribe();
      } catch {}
    });

    state.subscriptions = [];

    if (state.client) {
      try {
        await state.client.deactivate();
      } catch (error) {
        console.error(
            "STOMP disconnect error:",
            error,
        );
      }
    }

    state.client = null;

    state.peers.forEach((peer) => {
      try {
        peer.pc.close();
      } catch {}
    });

    state.peers.clear();

    if (state.localStream) {
      state.localStream
          .getTracks()
          .forEach((track) => track.stop());
    }

    state.localStream = null;

    state.participants.clear();
    state.seenMessages.clear();

    el("videoGrid")?.replaceChildren();
    el("chatMessages")?.replaceChildren();

    closePanel();

    if (returnToLanding) {
      el("meetingScreen")?.classList.add("hidden");
      el("landingScreen")?.classList.remove("hidden");

      showFeedback(
          "landingFeedback",
          "You left the meeting.",
      );
    }

    state.roomId = "";
    state.clientId = "";
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

el("createMeetingBtn")?.addEventListener(
    "click",
    createMeeting,
);

el("joinMeetingBtn")?.addEventListener(
    "click",
    joinMeeting,
);

el("copyCreatedRoomBtn")?.addEventListener(
    "click",
    copyRoomId,
);

el("copyRoomBtn")?.addEventListener(
    "click",
    copyRoomId,
);

el("leaveMeetingBtn")?.addEventListener(
    "click",
    () => cleanup(),
);

el("leaveMobileBtn")?.addEventListener(
    "click",
    () => cleanup(),
);

el("micBtn")?.addEventListener(
    "click",
    toggleMic,
);

el("cameraBtn")?.addEventListener(
    "click",
    toggleCamera,
);

el("chatBtn")?.addEventListener(
    "click",
    () => openPanel("chat"),
);

el("participantsBtn")?.addEventListener(
    "click",
    () => openPanel("participants"),
);

el("closePanelBtn")?.addEventListener(
    "click",
    closePanel,
);

el("chatForm")?.addEventListener(
    "submit",
    sendChat,
);

document
    .querySelectorAll(".panel-tab[data-panel]")
    .forEach((btn) => {
      btn.addEventListener(
          "click",
          () => openPanel(btn.dataset.panel),
      );
    });

window.addEventListener("beforeunload", () => {
  if (
      state.client &&
      state.client.connected &&
      state.roomId
  ) {
    publishSignal("leave");
  }

  state.localStream
      ?.getTracks()
      .forEach((track) => track.stop());
});
