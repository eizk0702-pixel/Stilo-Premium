import { auth, db, TIMEZONE, SLOT_GRANULARITY_MINUTES, DEFAULT_WHATSAPP_NUMBER } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  shopName: "Stilo Premium",
  whatsappNumber: DEFAULT_WHATSAPP_NUMBER,
  businessHoursStart: "09:00",
  businessHoursEnd: "21:00",
  intervalMinutes: 30,
  timezone: TIMEZONE,
  whatsappIntro: "Olá, Jhow! Gostaria de confirmar meu agendamento na Stilo Premium."
};

const DEFAULT_SERVICES = [
  {
    id: "corte",
    name: "Corte",
    description: "Corte premium com acabamento refinado.",
    price: 45,
    durationMinutes: 30,
    active: true
  },
  {
    id: "penteado",
    name: "Penteado",
    description: "Finalização para elevar presença e definição.",
    price: 25,
    durationMinutes: 20,
    active: true
  },
  {
    id: "sobrancelha",
    name: "Sobrancelha",
    description: "Desenho limpo e alinhado ao seu rosto.",
    price: 15,
    durationMinutes: 10,
    active: true
  },
  {
    id: "barba",
    name: "Barba",
    description: "Modelagem e acabamento com presença de alto nível.",
    price: 30,
    durationMinutes: 20,
    active: true
  },
  {
    id: "tratamento-pele",
    name: "Tratamento de pele",
    description: "Cuidado facial para limpeza, hidratação e aparência premium.",
    price: 40,
    durationMinutes: 30,
    active: true
  }
];

const state = {
  user: null,
  isAdmin: false,
  subscriptions: [],
  bookingsUnsubscribe: null,
  manualBlocksUnsubscribe: null,
  realtimeWindowStart: "",
  realtimeWindowEnd: "",
  settings: { ...DEFAULT_SETTINGS },
  services: [],
  bookings: [],
  manualBlocks: [],
  selectedTab: "dashboard",
  agendaDate: getTodayInTimeZone(),
  selectedOrderId: "",
  orderSearch: "",
  orderFilterDate: ""
};

const refs = {
  loginView: document.getElementById("loginView"),
  adminApp: document.getElementById("adminApp"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  adminUserChip: document.getElementById("adminUserChip"),
  logoutBtn: document.getElementById("logoutBtn"),
  backToSiteBtn: document.getElementById("backToSiteBtn"),
  currentDatePill: document.getElementById("currentDatePill"),
  timezonePill: document.getElementById("timezonePill"),
  dashboardStats: document.getElementById("dashboardStats"),
  upcomingList: document.getElementById("upcomingList"),
  pendingList: document.getElementById("pendingList"),
  agendaDate: document.getElementById("agendaDate"),
  refreshAgendaBtn: document.getElementById("refreshAgendaBtn"),
  exportAgendaBtn: document.getElementById("exportAgendaBtn"),
  manualBlockForm: document.getElementById("manualBlockForm"),
  blockDate: document.getElementById("blockDate"),
  blockStartTime: document.getElementById("blockStartTime"),
  blockEndTime: document.getElementById("blockEndTime"),
  blockReason: document.getElementById("blockReason"),
  agendaTimeline: document.getElementById("agendaTimeline"),
  pedidosFilterDate: document.getElementById("pedidosFilterDate"),
  pedidosSearch: document.getElementById("pedidosSearch"),
  ordersTableBody: document.getElementById("ordersTableBody"),
  orderDetailContent: document.getElementById("orderDetailContent"),
  copyOrderSummaryBtn: document.getElementById("copyOrderSummaryBtn"),
  servicesAdminGrid: document.getElementById("servicesAdminGrid"),
  openServiceModalBtn: document.getElementById("openServiceModalBtn"),
  closeServiceModalBtn: document.getElementById("closeServiceModalBtn"),
  serviceModal: document.getElementById("serviceModal"),
  serviceModalTitle: document.getElementById("serviceModalTitle"),
  serviceForm: document.getElementById("serviceForm"),
  serviceId: document.getElementById("serviceId"),
  serviceName: document.getElementById("serviceName"),
  servicePrice: document.getElementById("servicePrice"),
  serviceDuration: document.getElementById("serviceDuration"),
  serviceActive: document.getElementById("serviceActive"),
  serviceDescription: document.getElementById("serviceDescription"),
  seedServicesBtn: document.getElementById("seedServicesBtn"),
  settingsForm: document.getElementById("settingsForm"),
  shopName: document.getElementById("shopName"),
  whatsappNumber: document.getElementById("whatsappNumber"),
  businessHoursStart: document.getElementById("businessHoursStart"),
  businessHoursEnd: document.getElementById("businessHoursEnd"),
  intervalMinutes: document.getElementById("intervalMinutes"),
  whatsappIntro: document.getElementById("whatsappIntro"),
  toast: document.getElementById("toast"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText")
};

bootstrap();

function bootstrap() {
  refs.agendaDate.value = state.agendaDate;
  refs.blockDate.value = state.agendaDate;
  refs.currentDatePill.textContent = formatDateLong(state.agendaDate);
  refs.timezonePill.textContent = TIMEZONE;

  bindStaticEvents();
  bindTabEvents();
  watchAuth();
}

function bindStaticEvents() {
  refs.backToSiteBtn.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  refs.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = refs.loginEmail.value.trim();
    const password = refs.loginPassword.value;

    if (!email || !password) {
      showToast("Preencha e-mail e senha.", "error");
      return;
    }

    setLoading(true, "Validando acesso...");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      refs.loginForm.reset();
    } catch (error) {
      console.error(error);
      showToast("Falha ao entrar. Revise e-mail, senha e permissão de admin.", "error");
    } finally {
      setLoading(false);
    }
  });

  refs.logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  refs.agendaDate.addEventListener("change", () => {
    state.agendaDate = refs.agendaDate.value || getTodayInTimeZone();
    refs.blockDate.value = state.agendaDate;
    refreshWindowSubscriptions();
    renderAgenda();
  });

  refs.refreshAgendaBtn.addEventListener("click", () => {
    renderAgenda();
    showToast("Agenda recarregada.");
  });

  refs.exportAgendaBtn.addEventListener("click", exportAgendaDay);

  refs.manualBlockForm.addEventListener("submit", createManualBlock);

  refs.pedidosFilterDate.addEventListener("change", () => {
    state.orderFilterDate = refs.pedidosFilterDate.value;
    refreshWindowSubscriptions();
    renderOrdersTable();
  });

  refs.pedidosSearch.addEventListener("input", () => {
    state.orderSearch = refs.pedidosSearch.value.trim().toLowerCase();
    renderOrdersTable();
  });

  refs.copyOrderSummaryBtn.addEventListener("click", copySelectedOrderSummary);

  refs.openServiceModalBtn.addEventListener("click", () => openServiceModal());
  refs.closeServiceModalBtn.addEventListener("click", closeServiceModal);
  refs.serviceModal.addEventListener("click", (event) => {
    if (event.target === refs.serviceModal) {
      closeServiceModal();
    }
  });

  refs.serviceForm.addEventListener("submit", saveService);
  refs.seedServicesBtn.addEventListener("click", seedDefaultServices);
  refs.settingsForm.addEventListener("submit", saveSettings);
}

function bindTabEvents() {
  document.querySelectorAll(".admin-tab-btn").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
}

function setActiveTab(tabName) {
  state.selectedTab = tabName;

  document.querySelectorAll(".admin-tab-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  });

  document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  });
}

function watchAuth() {
  onAuthStateChanged(auth, async (user) => {
    cleanupSubscriptions();

    if (!user) {
      state.user = null;
      state.isAdmin = false;
      toggleAdminView(false);
      refs.adminUserChip.textContent = "Sessão não iniciada";
      return;
    }

    setLoading(true, "Validando permissões...");
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists() || userDoc.data().role !== "admin") {
        await signOut(auth);
        throw new Error("Usuário sem permissão administrativa.");
      }

      state.user = user;
      state.isAdmin = true;
      refs.adminUserChip.textContent = user.email || user.uid;
      toggleAdminView(true);
      startRealtimeData();
    } catch (error) {
      console.error(error);
      showToast(error.message || "Acesso administrativo negado.", "error");
      toggleAdminView(false);
    } finally {
      setLoading(false);
    }
  });
}

function toggleAdminView(isVisible) {
  refs.loginView.classList.toggle("hidden", isVisible);
  refs.adminApp.classList.toggle("hidden", !isVisible);
  refs.logoutBtn.classList.toggle("hidden", !isVisible);
}

function startRealtimeData() {
  refs.currentDatePill.textContent = formatDateLong(state.agendaDate);

  const unsubSettings = onSnapshot(
    doc(db, "settings", "general"),
    (snapshot) => {
      state.settings = snapshot.exists() ? normalizeSettings(snapshot.data()) : normalizeSettings();
      applySettingsToForm();
      renderDashboard();
      renderAgenda();
      renderOrderDetail();
    },
    (error) => handleSnapshotError("configurações", error)
  );

  const unsubServices = onSnapshot(
    collection(db, "services"),
    (snapshot) => {
      state.services = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      renderServicesAdmin();
    },
    (error) => handleSnapshotError("serviços", error)
  );

  state.subscriptions.push(unsubSettings, unsubServices);
  refreshWindowSubscriptions(true);
}

function cleanupSubscriptions() {
  state.subscriptions.forEach((unsubscribe) => unsubscribe());
  state.subscriptions = [];

  if (state.bookingsUnsubscribe) {
    state.bookingsUnsubscribe();
    state.bookingsUnsubscribe = null;
  }

  if (state.manualBlocksUnsubscribe) {
    state.manualBlocksUnsubscribe();
    state.manualBlocksUnsubscribe = null;
  }

  state.realtimeWindowStart = "";
  state.realtimeWindowEnd = "";
  state.bookings = [];
  state.manualBlocks = [];
}

function handleSnapshotError(label, error) {
  console.error(error);
  showToast(`Falha ao carregar ${label}.`, "error");
}

function refreshWindowSubscriptions(force = false) {
  if (!state.isAdmin) {
    return;
  }

  const nextWindow = computeRealtimeWindow();
  if (!force && nextWindow.start === state.realtimeWindowStart && nextWindow.end === state.realtimeWindowEnd) {
    return;
  }

  if (state.bookingsUnsubscribe) {
    state.bookingsUnsubscribe();
    state.bookingsUnsubscribe = null;
  }

  if (state.manualBlocksUnsubscribe) {
    state.manualBlocksUnsubscribe();
    state.manualBlocksUnsubscribe = null;
  }

  state.realtimeWindowStart = nextWindow.start;
  state.realtimeWindowEnd = nextWindow.end;

  const bookingsQuery = query(
    collection(db, "bookings"),
    where("date", ">=", nextWindow.start),
    where("date", "<=", nextWindow.end)
  );

  state.bookingsUnsubscribe = onSnapshot(
    bookingsQuery,
    (snapshot) => {
      state.bookings = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      ensureSelectedOrder();
      renderDashboard();
      renderAgenda();
      renderOrdersTable();
      renderOrderDetail();
    },
    (error) => handleSnapshotError("pedidos", error)
  );

  const manualBlocksQuery = query(
    collection(db, "manualBlocks"),
    where("date", ">=", nextWindow.start),
    where("date", "<=", nextWindow.end)
  );

  state.manualBlocksUnsubscribe = onSnapshot(
    manualBlocksQuery,
    (snapshot) => {
      state.manualBlocks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAgenda();
    },
    (error) => handleSnapshotError("bloqueios manuais", error)
  );
}

function computeRealtimeWindow() {
  const today = getTodayInTimeZone();
  const anchors = [today];

  if (state.agendaDate) {
    anchors.push(state.agendaDate);
  }

  if (state.orderFilterDate) {
    anchors.push(state.orderFilterDate);
  }

  let start = addDaysToIsoDate(today, -30);
  let end = addDaysToIsoDate(today, 180);

  anchors.forEach((date) => {
    start = start < addDaysToIsoDate(date, -30) ? start : addDaysToIsoDate(date, -30);
    end = end > addDaysToIsoDate(date, 30) ? end : addDaysToIsoDate(date, 30);
  });

  return { start, end };
}

function renderDashboard() {
  const today = getTodayInTimeZone();
  const todaysBookings = getOperationalBookings().filter((booking) => booking.date === today);
  const pending = state.bookings.filter((booking) => booking.status === "pending");
  const revenueToday = todaysBookings.reduce((sum, booking) => sum + Number(booking.totalPrice || 0), 0);
  const durationToday = todaysBookings.reduce((sum, booking) => sum + Number(booking.totalDurationMinutes || 0), 0);

  refs.dashboardStats.innerHTML = `
    <article class="dashboard-card">
      <span class="eyebrow">hoje</span>
      <h3>Pedidos do dia</h3>
      <strong>${todaysBookings.length}</strong>
    </article>
    <article class="dashboard-card">
      <span class="eyebrow">hoje</span>
      <h3>Faturamento do dia</h3>
      <strong>${formatCurrency(revenueToday)}</strong>
    </article>
    <article class="dashboard-card">
      <span class="eyebrow">hoje</span>
      <h3>Tempo agendado</h3>
      <strong>${durationToday} min</strong>
    </article>
    <article class="dashboard-card">
      <span class="eyebrow">fila</span>
      <h3>Pedidos pendentes</h3>
      <strong>${pending.length}</strong>
    </article>
  `;

  const upcoming = getUpcomingBookings(5);
  refs.upcomingList.innerHTML = upcoming.length
    ? upcoming
        .map(
          (booking) => `
            <article class="timeline-card">
              <div class="summary-row">
                <h4>${escapeHtml(booking.customerName)}</h4>
                ${renderStatusBadge(booking.status)}
              </div>
              <p>${formatDateLong(booking.date)} • ${booking.startTime} → ${booking.endTime}</p>
              <div class="helper-text">${escapeHtml(booking.items?.map((item) => item.name).join(", ") || "Sem itens")}</div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><strong>Sem próximos atendimentos.</strong><p>Nada marcado a partir de agora.</p></div>`;

  refs.pendingList.innerHTML = pending.length
    ? pending
        .slice(0, 5)
        .map(
          (booking) => `
            <article class="timeline-card">
              <div class="summary-row">
                <h4>${escapeHtml(booking.customerName)}</h4>
                ${renderStatusBadge(booking.status)}
              </div>
              <p>${formatDateLong(booking.date)} • ${booking.startTime} → ${booking.endTime}</p>
              <div class="row-actions">
                <button class="btn btn-success btn-sm" type="button" data-booking-action="confirm" data-booking-id="${booking.id}">Confirmar</button>
                <button class="btn btn-danger btn-sm" type="button" data-booking-action="cancel" data-booking-id="${booking.id}">Cancelar</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><strong>Nada pendente.</strong><p>Os pedidos pendentes aparecem aqui para ação rápida.</p></div>`;

  bindBookingActionButtons();
}

function renderAgenda() {
  refs.currentDatePill.textContent = formatDateLong(state.agendaDate);

  const dayBookings = state.bookings
    .filter((booking) => booking.date === state.agendaDate)
    .sort(sortByStart);

  const dayBlocks = state.manualBlocks
    .filter((block) => block.date === state.agendaDate && block.active !== false)
    .sort(sortByStart);

  const merged = [
    ...dayBookings.map((booking) => ({ type: "booking", ...booking })),
    ...dayBlocks.map((block) => ({ type: "manual", ...block }))
  ].sort(sortByStart);

  refs.agendaTimeline.innerHTML = merged.length
    ? merged
        .map((entry) => {
          if (entry.type === "manual") {
            return `
              <article class="timeline-card is-block">
                <div class="summary-row">
                  <h4>Bloqueio manual</h4>
                  <span class="status-badge blocked">bloqueado</span>
                </div>
                <p>${entry.startTime} → ${entry.endTime}</p>
                <div class="helper-text">Motivo: ${escapeHtml(entry.reason || "Não informado")}</div>
                <div class="row-actions">
                  <button class="btn btn-tertiary btn-sm" type="button" data-unblock-id="${entry.id}">Desbloquear</button>
                </div>
              </article>
            `;
          }

          return `
            <article class="timeline-card ${entry.status === "cancelled" ? "is-cancelled" : ""}">
              <div class="summary-row">
                <h4>${escapeHtml(entry.customerName)}</h4>
                ${renderStatusBadge(entry.status)}
              </div>
              <p>${entry.startTime} → ${entry.endTime} • ${formatCurrency(entry.totalPrice)}</p>
              <div class="helper-text">${escapeHtml(entry.items?.map((item) => item.name).join(", ") || "Sem itens")}</div>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-select-order="${entry.id}">Detalhes</button>
                ${entry.status === "pending" ? `<button class="btn btn-success btn-sm" type="button" data-booking-action="confirm" data-booking-id="${entry.id}">Confirmar</button>` : ""}
                ${entry.status !== "cancelled" ? `<button class="btn btn-tertiary btn-sm" type="button" data-booking-action="complete" data-booking-id="${entry.id}">Concluir</button>` : ""}
                ${entry.status !== "cancelled" ? `<button class="btn btn-danger btn-sm" type="button" data-booking-action="cancel" data-booking-id="${entry.id}">Cancelar</button>` : ""}
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state"><strong>Nenhum item na agenda.</strong><p>Quando houver agendamentos ou bloqueios, eles aparecem aqui.</p></div>`;

  refs.agendaTimeline.querySelectorAll("[data-select-order]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOrderId = button.dataset.selectOrder;
      setActiveTab("pedidos");
      renderOrdersTable();
      renderOrderDetail();
    });
  });

  bindBookingActionButtons();
  bindUnblockButtons();
}

function renderOrdersTable() {
  const orders = getFilteredOrders();

  refs.ordersTableBody.innerHTML = orders.length
    ? orders
        .map((booking) => {
          const created = formatTimestamp(booking.createdAt);
          return `
            <tr class="${state.selectedOrderId === booking.id ? "is-selected" : ""}" data-order-row="${booking.id}">
              <td class="mono">${booking.id.slice(0, 8)}</td>
              <td>${escapeHtml(booking.customerName || "-")}</td>
              <td>${escapeHtml(formatBookingPhone(booking) || "-")}</td>
              <td>${formatDateShort(booking.date)}</td>
              <td>${booking.startTime || "-"}</td>
              <td>${booking.endTime || "-"}</td>
              <td>${booking.totalDurationMinutes || 0} min</td>
              <td>${formatCurrency(booking.totalPrice || 0)}</td>
              <td>${renderStatusBadge(booking.status)}</td>
              <td>${created}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="10"><div class="empty-state"><strong>Nenhum pedido encontrado.</strong><p>Ajuste a busca ou o filtro de data.</p></div></td></tr>`;

  refs.ordersTableBody.querySelectorAll("[data-order-row]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedOrderId = row.dataset.orderRow;
      renderOrdersTable();
      renderOrderDetail();
    });
  });
}

function renderOrderDetail() {
  const booking = state.bookings.find((item) => item.id === state.selectedOrderId);

  if (!booking) {
    refs.orderDetailContent.innerHTML = `
      <div class="empty-state">
        <strong>Selecione um pedido.</strong>
        <p>Os detalhes completos aparecem aqui.</p>
      </div>
    `;
    refs.copyOrderSummaryBtn.disabled = true;
    return;
  }

  refs.copyOrderSummaryBtn.disabled = false;

  refs.orderDetailContent.innerHTML = `
    <div class="summary-row">
      <div>
        <strong>${escapeHtml(booking.customerName)}</strong>
        <div class="detail-muted">${escapeHtml(formatBookingPhone(booking) || "-")}</div>
      </div>
      ${renderStatusBadge(booking.status)}
    </div>

    <ul class="detail-list">
      <li><strong>ID:</strong> <span class="mono">${booking.id}</span></li>
      <li><strong>Data:</strong> ${formatDateLong(booking.date)}</li>
      <li><strong>Início:</strong> ${booking.startTime}</li>
      <li><strong>Término:</strong> ${booking.endTime}</li>
      <li><strong>Duração:</strong> ${booking.totalDurationMinutes || 0} min</li>
      <li><strong>Total:</strong> ${formatCurrency(booking.totalPrice || 0)}</li>
      <li><strong>Origem:</strong> ${escapeHtml(booking.source || "site")}</li>
      <li><strong>Criado em:</strong> ${formatTimestamp(booking.createdAt)}</li>
      <li><strong>Atualizado em:</strong> ${formatTimestamp(booking.updatedAt)}</li>
      <li><strong>Observações:</strong> ${escapeHtml(booking.notes || "Nenhuma")}</li>
    </ul>

    <hr class="separator" />

    <div class="detail-card">
      <h4>Serviços</h4>
      <ul class="detail-list">
        ${(booking.items || [])
          .map(
            (item) => `
              <li>${escapeHtml(item.name)} • ${item.durationMinutes} min • ${formatCurrency(item.price)}</li>
            `
          )
          .join("")}
      </ul>
    </div>

    <div class="row-actions">
      ${booking.status === "pending" ? `<button class="btn btn-success btn-sm" type="button" data-booking-action="confirm" data-booking-id="${booking.id}">Confirmar</button>` : ""}
      ${booking.status !== "cancelled" ? `<button class="btn btn-tertiary btn-sm" type="button" data-booking-action="complete" data-booking-id="${booking.id}">Concluir</button>` : ""}
      ${booking.status !== "cancelled" ? `<button class="btn btn-danger btn-sm" type="button" data-booking-action="cancel" data-booking-id="${booking.id}">Cancelar</button>` : ""}
    </div>
  `;

  bindBookingActionButtons();
}

function renderServicesAdmin() {
  refs.servicesAdminGrid.innerHTML = state.services.length
    ? state.services
        .map(
          (service) => `
            <article class="service-editor">
              <div class="summary-row">
                <div>
                  <h4>${escapeHtml(service.name)}</h4>
                  <div class="detail-muted">${escapeHtml(service.description || "Sem descrição")}</div>
                </div>
                <span class="price-tag">${formatCurrency(service.price)}</span>
              </div>

              <div class="summary-row">
                <span>${service.durationMinutes} min</span>
                <span class="badge">${service.active ? "Ativo" : "Inativo"}</span>
              </div>

              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-edit-service="${service.id}">Editar</button>
                <button class="btn btn-tertiary btn-sm" type="button" data-toggle-service="${service.id}">
                  ${service.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><strong>Nenhum serviço cadastrado.</strong><p>Use o botão acima para criar ou restaurar os serviços padrão.</p></div>`;

  refs.servicesAdminGrid.querySelectorAll("[data-edit-service]").forEach((button) => {
    button.addEventListener("click", () => openServiceModal(button.dataset.editService));
  });

  refs.servicesAdminGrid.querySelectorAll("[data-toggle-service]").forEach((button) => {
    button.addEventListener("click", async () => {
      const service = state.services.find((item) => item.id === button.dataset.toggleService);
      if (!service) {
        return;
      }
      await updateDoc(doc(db, "services", service.id), {
        active: !service.active,
        updatedAt: serverTimestamp()
      });
      showToast(`Serviço ${service.active ? "desativado" : "ativado"}.`);
    });
  });
}

function applySettingsToForm() {
  refs.shopName.value = state.settings.shopName || DEFAULT_SETTINGS.shopName;
  refs.whatsappNumber.value = formatAdminWhatsApp(state.settings.whatsappNumber || DEFAULT_SETTINGS.whatsappNumber);
  refs.businessHoursStart.value = state.settings.businessHoursStart || DEFAULT_SETTINGS.businessHoursStart;
  refs.businessHoursEnd.value = state.settings.businessHoursEnd || DEFAULT_SETTINGS.businessHoursEnd;
  refs.intervalMinutes.value = state.settings.intervalMinutes || DEFAULT_SETTINGS.intervalMinutes;
  refs.whatsappIntro.value = state.settings.whatsappIntro || DEFAULT_SETTINGS.whatsappIntro;
}

async function saveSettings(event) {
  event.preventDefault();

  const whatsappNumber = normalizeWhatsAppNumber(refs.whatsappNumber.value);
  const payload = {
    shopName: refs.shopName.value.trim(),
    whatsappNumber,
    businessHoursStart: refs.businessHoursStart.value,
    businessHoursEnd: refs.businessHoursEnd.value,
    intervalMinutes: Number(refs.intervalMinutes.value),
    timezone: TIMEZONE,
    whatsappIntro: refs.whatsappIntro.value.trim()
  };

  if (!payload.shopName || !payload.whatsappNumber || !payload.businessHoursStart || !payload.businessHoursEnd || !payload.intervalMinutes) {
    showToast("Preencha todas as configurações obrigatórias.", "error");
    return;
  }

  if (!whatsappNumber) {
    showToast("Informe um WhatsApp válido do Brasil para receber os pedidos.", "error");
    return;
  }

  if (timeToMinutes(payload.businessHoursEnd) <= timeToMinutes(payload.businessHoursStart)) {
    showToast("O fim do expediente precisa ser depois do início.", "error");
    return;
  }

  if (![5, 10, 15, 20, 30, 60].includes(payload.intervalMinutes)) {
    showToast("Use um intervalo base válido: 5, 10, 15, 20, 30 ou 60 minutos.", "error");
    return;
  }

  await setDocumentWithCreatedAt(doc(db, "settings", "general"), {
    ...DEFAULT_SETTINGS,
    ...payload
  });

  showToast("Configurações salvas.");
}

async function seedDefaultServices() {
  setLoading(true, "Restaurando serviços padrão...");
  try {
    for (const service of DEFAULT_SERVICES) {
      await setDocumentWithCreatedAt(doc(db, "services", service.id), service);
    }
    showToast("Serviços padrão restaurados.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível restaurar os serviços padrão.", "error");
  } finally {
    setLoading(false);
  }
}

function openServiceModal(serviceId = "") {
  const service = state.services.find((item) => item.id === serviceId);

  refs.serviceModalTitle.textContent = service ? "Editar serviço" : "Novo serviço";
  refs.serviceId.value = service?.id || "";
  refs.serviceName.value = service?.name || "";
  refs.servicePrice.value = service?.price ?? "";
  refs.serviceDuration.value = service?.durationMinutes ?? "";
  refs.serviceActive.value = String(service?.active ?? true);
  refs.serviceDescription.value = service?.description || "";
  refs.serviceModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeServiceModal() {
  refs.serviceModal.hidden = true;
  document.body.classList.remove("modal-open");
  refs.serviceForm.reset();
  refs.serviceId.value = "";
}

async function saveService(event) {
  event.preventDefault();

  const existingId = refs.serviceId.value.trim();
  const name = refs.serviceName.value.trim();
  const price = Number(refs.servicePrice.value);
  const durationMinutes = Number(refs.serviceDuration.value);
  const active = refs.serviceActive.value === "true";
  const description = refs.serviceDescription.value.trim();

  if (!name || !price || !durationMinutes) {
    showToast("Preencha nome, preço e duração do serviço.", "error");
    return;
  }

  const serviceId = existingId || slugify(name);
  const ref = doc(db, "services", serviceId);

  await setDocumentWithCreatedAt(ref, {
    id: serviceId,
    name,
    description,
    price,
    durationMinutes,
    active
  });

  closeServiceModal();
  showToast("Serviço salvo.");
}

async function createManualBlock(event) {
  event.preventDefault();

  const date = refs.blockDate.value;
  const startTime = refs.blockStartTime.value;
  const endTime = refs.blockEndTime.value;
  const reason = refs.blockReason.value.trim();

  if (!date || !startTime || !endTime || !reason) {
    showToast("Preencha data, início, término e motivo do bloqueio.", "error");
    return;
  }

  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    showToast("O término do bloqueio precisa ser depois do início.", "error");
    return;
  }

  setLoading(true, "Criando bloqueio manual...");
  try {
    const blockRef = doc(collection(db, "manualBlocks"));
    const lockIds = buildSlotDocIds(date, startTime, endTime);

    await runTransaction(db, async (transaction) => {
      for (const slotId of lockIds) {
        const slotRef = doc(db, "scheduleLocks", slotId);
        const slotSnapshot = await transaction.get(slotRef);
        if (slotSnapshot.exists() && slotSnapshot.data().active) {
          throw new Error("Existe conflito com um agendamento ou bloqueio já ativo nesse intervalo.");
        }
      }

      transaction.set(blockRef, {
        date,
        startTime,
        endTime,
        reason,
        active: true,
        createdBy: state.user?.uid || "admin",
        lockIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      lockIds.forEach((slotId) => {
        const lockRef = doc(db, "scheduleLocks", slotId);
        transaction.set(lockRef, {
          active: true,
          type: "manual",
          manualBlockId: blockRef.id,
          date,
          time: slotId.split("_")[1].replace(/(\d{2})(\d{2})/, "$1:$2"),
          slotGranularityMinutes: SLOT_GRANULARITY_MINUTES,
          startTime,
          endTime,
          reason,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    });

    refs.manualBlockForm.reset();
    refs.blockDate.value = state.agendaDate;
    showToast("Horário bloqueado com sucesso.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Não foi possível criar o bloqueio.", "error");
  } finally {
    setLoading(false);
  }
}

async function updateBookingStatus(bookingId, action) {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) {
    showToast("Pedido não encontrado.", "error");
    return;
  }

  if (action === "cancel") {
    const confirmed = window.confirm("Cancelar este pedido vai liberar a agenda. Deseja continuar?");
    if (!confirmed) {
      return;
    }

    setLoading(true, "Cancelando pedido e liberando agenda...");
    try {
      const batch = writeBatch(db);
      const bookingRef = doc(db, "bookings", booking.id);

      batch.update(bookingRef, {
        status: "cancelled",
        updatedAt: serverTimestamp()
      });

      (booking.lockIds || []).forEach((lockId) => {
        batch.update(doc(db, "scheduleLocks", lockId), {
          active: false,
          releasedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      showToast("Pedido cancelado e agenda liberada.");
    } catch (error) {
      console.error(error);
      showToast("Não foi possível cancelar o pedido.", "error");
    } finally {
      setLoading(false);
    }

    return;
  }

  const nextStatus = action === "confirm" ? "confirmed" : "completed";
  await updateDoc(doc(db, "bookings", booking.id), {
    status: nextStatus,
    updatedAt: serverTimestamp()
  });

  showToast(`Pedido marcado como ${translateStatus(nextStatus)}.`);
}

async function unblockManualBlock(blockId) {
  const block = state.manualBlocks.find((item) => item.id === blockId);
  if (!block) {
    showToast("Bloqueio não encontrado.", "error");
    return;
  }

  const confirmed = window.confirm("Desbloquear este intervalo?");
  if (!confirmed) {
    return;
  }

  setLoading(true, "Liberando bloqueio manual...");
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "manualBlocks", block.id), {
      active: false,
      updatedAt: serverTimestamp()
    });

    (block.lockIds || []).forEach((lockId) => {
      batch.update(doc(db, "scheduleLocks", lockId), {
        active: false,
        releasedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
    showToast("Bloqueio manual removido.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível desbloquear esse intervalo.", "error");
  } finally {
    setLoading(false);
  }
}

function bindBookingActionButtons() {
  document.querySelectorAll("[data-booking-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bookingId = button.dataset.bookingId;
      const action = button.dataset.bookingAction;
      await updateBookingStatus(bookingId, action);
    });
  });
}

function bindUnblockButtons() {
  document.querySelectorAll("[data-unblock-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await unblockManualBlock(button.dataset.unblockId);
    });
  });
}

function getFilteredOrders() {
  return [...state.bookings]
    .filter((booking) => (state.orderFilterDate ? booking.date === state.orderFilterDate : true))
    .filter((booking) => {
      if (!state.orderSearch) {
        return true;
      }
      const haystack = `${booking.customerName || ""} ${booking.customerPhone || ""} ${booking.customerPhoneDigits || ""} ${formatBookingPhone(booking)}`.toLowerCase();
      return haystack.includes(state.orderSearch);
    })
    .sort((a, b) => {
      if (a.date !== b.date) {
        return String(b.date).localeCompare(String(a.date));
      }
      return (b.startMinuteOfDay || 0) - (a.startMinuteOfDay || 0);
    });
}

function ensureSelectedOrder() {
  const orders = getFilteredOrders();
  if (!orders.length) {
    state.selectedOrderId = "";
    return;
  }

  if (!state.selectedOrderId || !state.bookings.some((booking) => booking.id === state.selectedOrderId)) {
    state.selectedOrderId = orders[0].id;
  }
}

function copySelectedOrderSummary() {
  const booking = state.bookings.find((item) => item.id === state.selectedOrderId);
  if (!booking) {
    showToast("Selecione um pedido antes de copiar.", "error");
    return;
  }

  const text = [
    `Pedido ${booking.id}`,
    `Cliente: ${booking.customerName}`,
    `Telefone: ${formatBookingPhone(booking)}`,
    `Data: ${formatDateLong(booking.date)}`,
    `Horário: ${booking.startTime} → ${booking.endTime}`,
    `Status: ${translateStatus(booking.status)}`,
    `Serviços: ${(booking.items || []).map((item) => item.name).join(", ")}`,
    `Total: ${formatCurrency(booking.totalPrice || 0)}`,
    `Observações: ${booking.notes || "Nenhuma"}`
  ].join("\n");

  navigator.clipboard.writeText(text).then(
    () => showToast("Resumo copiado."),
    () => showToast("Não foi possível copiar o resumo.", "error")
  );
}

function exportAgendaDay() {
  const entries = [
    ...state.bookings
      .filter((booking) => booking.date === state.agendaDate)
      .map((booking) => ({
        type: "booking",
        label: booking.customerName,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        notes: booking.items?.map((item) => item.name).join(", ") || ""
      })),
    ...state.manualBlocks
      .filter((block) => block.date === state.agendaDate && block.active !== false)
      .map((block) => ({
        type: "manual",
        label: "Bloqueio manual",
        startTime: block.startTime,
        endTime: block.endTime,
        status: "blocked",
        notes: block.reason || ""
      }))
  ].sort(sortByStart);

  if (!entries.length) {
    showToast("Não há nada para exportar nessa data.", "error");
    return;
  }

  const lines = [
    ["Tipo", "Rótulo", "Início", "Término", "Status", "Notas"].join(";"),
    ...entries.map((entry) =>
      [entry.type, entry.label, entry.startTime, entry.endTime, entry.status, entry.notes].join(";")
    )
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `agenda-${state.agendaDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);

  showToast("Agenda exportada em CSV.");
}

function getOperationalBookings() {
  return state.bookings.filter((booking) => booking.status !== "cancelled");
}

function getUpcomingBookings(limit) {
  const today = getTodayInTimeZone();
  const nowMinutes = getCurrentMinutesInTimeZone();

  return getOperationalBookings()
    .filter((booking) => booking.date > today || (booking.date === today && Number(booking.endMinuteOfDay || 0) >= nowMinutes))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return String(a.date).localeCompare(String(b.date));
      }
      return Number(a.startMinuteOfDay || 0) - Number(b.startMinuteOfDay || 0);
    })
    .slice(0, limit);
}

function setLoading(isLoading, message = "Processando...") {
  refs.loadingText.textContent = message;
  refs.loadingOverlay.hidden = !isLoading;
}

function showToast(message, type = "success") {
  refs.toast.textContent = message;
  refs.toast.className = `toast is-visible ${type === "error" ? "is-error" : ""}`;

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    refs.toast.className = "toast";
  }, 2800);
}

function renderStatusBadge(status) {
  return `<span class="status-badge ${status || "pending"}">${translateStatus(status || "pending")}</span>`;
}

function translateStatus(status) {
  const map = {
    pending: "pendente",
    confirmed: "confirmado",
    completed: "concluído",
    cancelled: "cancelado",
    blocked: "bloqueado"
  };
  return map[status] || status;
}

function buildSlotDocIds(date, startTime, endTime) {
  const ids = [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  for (let minute = start; minute < end; minute += SLOT_GRANULARITY_MINUTES) {
    ids.push(`${date}_${minutesToTime(minute).replace(":", "")}`);
  }

  return ids;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDateLong(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function formatDateShort(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function addDaysToIsoDate(date, amount) {
  const [year, month, day] = String(date).split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  value.setUTCDate(value.getUTCDate() + Number(amount || 0));
  return value.toISOString().slice(0, 10);
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const dateValue = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TIMEZONE
  }).format(dateValue);
}

function getTodayInTimeZone() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getCurrentMinutesInTimeZone() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const [hours, minutes] = formatter.format(new Date()).split(":").map(Number);
  return hours * 60 + minutes;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const safe = Math.max(0, Number(totalMinutes || 0));
  const hours = String(Math.floor(safe / 60)).padStart(2, "0");
  const minutes = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sortByStart(a, b) {
  return Number(a.startMinuteOfDay ?? timeToMinutes(a.startTime)) - Number(b.startMinuteOfDay ?? timeToMinutes(b.startTime));
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

function isValidBrazilPhone(value) {
  return /^[1-9]{2}(?:9\d{8}|\d{8})$/.test(normalizePhone(value));
}

function normalizeWhatsAppNumber(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if ((raw.length === 12 || raw.length === 13) && raw.startsWith("55") && isValidBrazilPhone(raw.slice(2))) {
    return raw;
  }

  const local = normalizePhone(raw);
  if (isValidBrazilPhone(local)) {
    return `55${local}`;
  }

  return "";
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function formatAdminWhatsApp(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if ((raw.length === 12 || raw.length === 13) && raw.startsWith("55") && isValidBrazilPhone(raw.slice(2))) {
    return `+55 ${formatPhone(raw.slice(2))}`;
  }
  return formatPhone(raw);
}

function formatBookingPhone(booking) {
  if (!booking) {
    return "";
  }

  if (booking.customerPhoneDigits && isValidBrazilPhone(booking.customerPhoneDigits)) {
    return formatPhone(booking.customerPhoneDigits);
  }

  return booking.customerPhone || "";
}

function normalizeSettings(data = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    timezone: TIMEZONE,
    whatsappNumber: normalizeWhatsAppNumber(data.whatsappNumber || DEFAULT_SETTINGS.whatsappNumber) || DEFAULT_WHATSAPP_NUMBER
  };
}

async function setDocumentWithCreatedAt(ref, data) {
  const snapshot = await getDoc(ref);
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };

  if (!snapshot.exists()) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
