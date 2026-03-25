import { db, TIMEZONE, TIMEZONE_OFFSET, SLOT_GRANULARITY_MINUTES, DEFAULT_WHATSAPP_NUMBER } from "./firebase-config.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where
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


const STORAGE_KEYS = {
  cart: "stilo-premium-cart",
  customer: "stilo-premium-customer"
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  services: [],
  cart: loadJSON(STORAGE_KEYS.cart, []),
  customer: loadJSON(STORAGE_KEYS.customer, { name: "", phone: "", notes: "" }),
  selectedDate: getTodayInTimeZone(),
  selectedStartTime: "",
  activeLocks: new Set(),
  locksUnsubscribe: null,
  servicesStatus: "loading",
  servicesErrorMessage: "",
  isSubmitting: false
};

const refs = {
  servicesGrid: document.getElementById("servicesGrid"),
  cartContent: document.getElementById("cartContent"),
  bookingDate: document.getElementById("bookingDate"),
  availabilityMeta: document.getElementById("availabilityMeta"),
  timeSlots: document.getElementById("timeSlots"),
  customerName: document.getElementById("customerName"),
  customerPhone: document.getElementById("customerPhone"),
  customerNotes: document.getElementById("customerNotes"),
  confirmationSummary: document.getElementById("confirmationSummary"),
  submitBookingBtn: document.getElementById("submitBookingBtn"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  toast: document.getElementById("toast"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText")
};

bootstrap();

function bootstrap() {
  applyCustomerStateToForm();
  configureDateInput();
  bindStaticEvents();
  subscribeSettings();
  subscribeServices();
  subscribeLocksForDate(state.selectedDate);
  renderAll();
}

function bindStaticEvents() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const selector = button.getAttribute("data-scroll-target");
      const target = document.querySelector(selector);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  refs.bookingDate.addEventListener("change", (event) => {
    state.selectedDate = event.target.value;
    state.selectedStartTime = "";
    subscribeLocksForDate(state.selectedDate);
    renderAvailability();
    renderConfirmationSummary();
  });

  refs.customerName.addEventListener("input", (event) => {
    state.customer.name = event.target.value.trimStart();
    persistCustomer();
    renderConfirmationSummary();
  });

  refs.customerPhone.addEventListener("input", (event) => {
    const formatted = formatPhone(event.target.value);
    event.target.value = formatted;
    state.customer.phone = formatted;
    persistCustomer();
    renderConfirmationSummary();
  });

  refs.customerNotes.addEventListener("input", (event) => {
    state.customer.notes = event.target.value.trimStart();
    persistCustomer();
    renderConfirmationSummary();
  });

  refs.clearCartBtn.addEventListener("click", () => {
    if (!state.cart.length) {
      showToast("O carrinho já está vazio.", "error");
      return;
    }
    state.cart = [];
    state.selectedStartTime = "";
    persistCart();
    renderAll();
    showToast("Carrinho limpo.");
  });

  refs.submitBookingBtn.addEventListener("click", submitBooking);
}

function configureDateInput() {
  refs.bookingDate.min = getTodayInTimeZone();
  refs.bookingDate.value = state.selectedDate;
}

function subscribeSettings() {
  const settingsRef = doc(db, "settings", "general");
  onSnapshot(
    settingsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        state.settings = normalizeSettings(snapshot.data());
      } else {
        state.settings = normalizeSettings();
      }
      renderAvailability();
      renderConfirmationSummary();
    },
    (error) => {
      console.error(error);
      state.settings = normalizeSettings();
      renderAvailability();
      renderConfirmationSummary();
      showToast("Não foi possível carregar as configurações em tempo real. Usando padrão seguro do sistema.", "error");
    }
  );
}

function subscribeServices() {
  const servicesQuery = query(collection(db, "services"), where("active", "==", true));
  onSnapshot(
    servicesQuery,
    (snapshot) => {
      const services = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      state.services = services;
      state.servicesStatus = services.length ? "ready" : "empty";
      state.servicesErrorMessage = "";
      syncCartWithServices();
      renderAll();
    },
    (error) => {
      console.error(error);
      state.services = [];
      state.servicesStatus = "error";
      state.servicesErrorMessage = "Não foi possível carregar o catálogo agora. Tente novamente em instantes.";
      syncCartWithServices();
      renderAll();
      showToast("Não foi possível carregar os serviços do Firebase.", "error");
    }
  );
}

function subscribeLocksForDate(date) {
  if (state.locksUnsubscribe) {
    state.locksUnsubscribe();
    state.locksUnsubscribe = null;
  }

  if (!date) {
    state.activeLocks = new Set();
    renderAvailability();
    return;
  }

  const locksQuery = query(collection(db, "scheduleLocks"), where("date", "==", date), where("active", "==", true));

  state.locksUnsubscribe = onSnapshot(
    locksQuery,
    (snapshot) => {
      state.activeLocks = new Set(snapshot.docs.map((item) => item.id));
      if (state.selectedStartTime && !isStartTimeAvailable(state.selectedStartTime)) {
        state.selectedStartTime = "";
        showToast("O horário selecionado ficou indisponível e foi removido do pedido.", "error");
      }
      renderAvailability();
      renderConfirmationSummary();
    },
    (error) => {
      console.error(error);
      state.activeLocks = new Set();
      renderAvailability();
      showToast("Não foi possível consultar a agenda em tempo real.", "error");
    }
  );
}

function renderAll() {
  renderServices();
  renderCart();
  renderAvailability();
  renderConfirmationSummary();
}

function renderServices() {
  if (state.servicesStatus === "loading") {
    refs.servicesGrid.innerHTML = `
      <article class="empty-state premium-card">
        <strong>Carregando catálogo...</strong>
        <p>Consultando os serviços ativos da barbearia.</p>
      </article>
    `;
    return;
  }

  if (state.servicesStatus === "error") {
    refs.servicesGrid.innerHTML = `
      <article class="empty-state premium-card">
        <strong>Catálogo indisponível.</strong>
        <p>${escapeHtml(state.servicesErrorMessage || "Não foi possível carregar os serviços ativos no momento.")}</p>
      </article>
    `;
    return;
  }

  if (!state.services.length) {
    refs.servicesGrid.innerHTML = `
      <article class="empty-state premium-card">
        <strong>Nenhum serviço disponível.</strong>
        <p>O catálogo público só é liberado quando existir serviço ativo real no Firebase.</p>
      </article>
    `;
    return;
  }

  refs.servicesGrid.innerHTML = `
    ${state.services
      .map((service) => {
        const inCart = state.cart.some((item) => item.id === service.id);
        return `
          <article class="service-card premium-card ${inCart ? "is-selected" : ""}">
            <div class="service-top">
              <div>
                <h3>${escapeHtml(service.name)}</h3>
                <p>${escapeHtml(service.description || "")}</p>
              </div>
              <span class="price-tag">${formatCurrency(service.price)}</span>
            </div>

            <span class="duration-chip">${service.durationMinutes} min</span>

            <div class="service-actions">
              <span class="cart-meta">${inCart ? "Já está no carrinho" : "Adicionar ao carrinho"}</span>
              <button class="btn ${inCart ? "btn-secondary" : "btn-primary"} btn-sm" type="button" data-add-service="${service.id}">
                ${inCart ? "Adicionado" : "Adicionar"}
              </button>
            </div>
          </article>
        `;
      })
      .join("")}
  `;

  refs.servicesGrid.querySelectorAll("[data-add-service]").forEach((button) => {
    button.addEventListener("click", () => addServiceToCart(button.dataset.addService));
  });
}

function renderCart() {
  if (!state.cart.length) {
    refs.cartContent.innerHTML = `
      <div class="empty-state">
        <strong>Carrinho vazio.</strong>
        <p>Escolha pelo menos um serviço para liberar o cálculo da agenda.</p>
      </div>
    `;
    return;
  }

  const totalDuration = getCartDuration();
  const totalPrice = getCartTotal();

  refs.cartContent.innerHTML = `
    <div class="cart-items">
      ${state.cart
        .map(
          (item) => `
            <article class="cart-item">
              <div>
                <h4>${escapeHtml(item.name)}</h4>
                <div class="cart-meta">${item.durationMinutes} min • ${formatCurrency(item.price)}</div>
              </div>
              <button class="btn btn-tertiary btn-sm" type="button" data-remove-item="${item.id}">Remover</button>
            </article>
          `
        )
        .join("")}
    </div>

    <div class="summary-box">
      <div class="summary-row">
        <span>Itens</span>
        <strong>${state.cart.length}</strong>
      </div>
      <div class="summary-row">
        <span>Duração total</span>
        <strong>${totalDuration} min</strong>
      </div>
      <div class="summary-row total">
        <span>Total</span>
        <strong>${formatCurrency(totalPrice)}</strong>
      </div>
    </div>
  `;

  refs.cartContent.querySelectorAll("[data-remove-item]").forEach((button) => {
    button.addEventListener("click", () => removeServiceFromCart(button.dataset.removeItem));
  });
}

function renderAvailability() {
  const totalDuration = getCartDuration();

  if (!state.cart.length) {
    refs.availabilityMeta.textContent = "Selecione pelo menos um serviço para liberar os horários disponíveis.";
    refs.timeSlots.innerHTML = renderDisabledTimeState("Monte o carrinho para calcular a disponibilidade.");
    return;
  }

  if (!state.selectedDate) {
    refs.availabilityMeta.textContent = "Selecione uma data para consultar a agenda.";
    refs.timeSlots.innerHTML = renderDisabledTimeState("Escolha uma data para continuar.");
    return;
  }

  const allSlots = getStartTimeOptions();
  if (!allSlots.length) {
    refs.availabilityMeta.textContent = "Não existem horários base configurados.";
    refs.timeSlots.innerHTML = renderDisabledTimeState("Revise o intervalo base nas configurações.");
    return;
  }

  const availableCount = allSlots.filter((time) => isStartTimeAvailable(time)).length;
  const formattedEnd = minutesToTime(timeToMinutes(state.settings.businessHoursEnd));
  refs.availabilityMeta.innerHTML = `
    Duração do pedido: <strong>${totalDuration} min</strong> •
    expediente até <strong>${formattedEnd}</strong> •
    horários livres: <strong>${availableCount}</strong>
  `;

  refs.timeSlots.innerHTML = allSlots
    .map((time) => {
      const available = isStartTimeAvailable(time);
      const selected = state.selectedStartTime === time;
      return `
        <button
          class="time-slot ${available ? "" : "is-unavailable"} ${selected ? "is-selected" : ""}"
          type="button"
          data-time-slot="${time}"
          ${available ? "" : "disabled"}
        >
          ${time}
        </button>
      `;
    })
    .join("");

  refs.timeSlots.querySelectorAll("[data-time-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const time = button.dataset.timeSlot;
      if (!isStartTimeAvailable(time)) {
        return;
      }
      state.selectedStartTime = time;
      renderAvailability();
      renderConfirmationSummary();
      showToast(`Horário ${time} selecionado.`);
    });
  });
}

function renderConfirmationSummary() {
  const totalDuration = getCartDuration();
  const totalPrice = getCartTotal();

  if (!state.cart.length) {
    refs.confirmationSummary.innerHTML = `
      <div class="empty-state">
        <strong>Sem pedido para confirmar.</strong>
        <p>Adicione serviços ao carrinho para ver o resumo final.</p>
      </div>
    `;
    refs.submitBookingBtn.disabled = true;
    return;
  }

  const endTime = state.selectedStartTime ? getEndTime(state.selectedStartTime, totalDuration) : "--:--";
  const isReady =
    Boolean(state.selectedDate) &&
    Boolean(state.selectedStartTime) &&
    Boolean(state.customer.name.trim()) &&
    isValidBrazilPhone(state.customer.phone);

  refs.submitBookingBtn.disabled = !isReady || state.isSubmitting;

  refs.confirmationSummary.innerHTML = `
    <div class="confirmation-card">
      <div class="summary-row">
        <span>Cliente</span>
        <strong>${state.customer.name ? escapeHtml(state.customer.name) : "Informe seu nome"}</strong>
      </div>
      <div class="summary-row">
        <span>Telefone</span>
        <strong>${state.customer.phone ? escapeHtml(state.customer.phone) : "Informe seu WhatsApp"}</strong>
      </div>
      <div class="summary-row">
        <span>Data</span>
        <strong>${state.selectedDate ? formatDateLong(state.selectedDate) : "Selecione uma data"}</strong>
      </div>
      <div class="summary-row">
        <span>Início</span>
        <strong>${state.selectedStartTime || "Selecione um horário"}</strong>
      </div>
      <div class="summary-row">
        <span>Término estimado</span>
        <strong>${endTime}</strong>
      </div>
      <div class="summary-row">
        <span>Duração total</span>
        <strong>${totalDuration} min</strong>
      </div>
      <div class="summary-row total">
        <span>Total</span>
        <strong>${formatCurrency(totalPrice)}</strong>
      </div>
    </div>

    <div class="confirmation-card">
      <strong>Serviços</strong>
      <ul class="confirmation-services">
        ${state.cart.map((item) => `<li>${escapeHtml(item.name)} • ${item.durationMinutes} min</li>`).join("")}
      </ul>
    </div>

    <div class="confirmation-card">
      <strong>Observações</strong>
      <p>${state.customer.notes ? escapeHtml(state.customer.notes) : "Nenhuma observação informada."}</p>
    </div>
  `;
}

function addServiceToCart(serviceId) {
  const service = state.services.find((item) => item.id === serviceId);
  if (!service) {
    showToast("Serviço não encontrado.", "error");
    return;
  }

  if (state.cart.some((item) => item.id === serviceId)) {
    showToast("Esse serviço já está no carrinho.", "error");
    return;
  }

  state.cart = [...state.cart, sanitizeServiceForCart(service)];
  persistCart();

  if (state.selectedStartTime && !isStartTimeAvailable(state.selectedStartTime)) {
    state.selectedStartTime = "";
  }

  renderAll();
  showToast(`${service.name} adicionado ao carrinho.`);
}

function removeServiceFromCart(serviceId) {
  const currentLength = state.cart.length;
  state.cart = state.cart.filter((item) => item.id !== serviceId);

  if (state.cart.length === currentLength) {
    return;
  }

  persistCart();

  if (state.selectedStartTime && !isStartTimeAvailable(state.selectedStartTime)) {
    state.selectedStartTime = "";
  }

  renderAll();
  showToast("Item removido do carrinho.");
}

function syncCartWithServices() {
  if (!state.cart.length) {
    return;
  }

  const previousLength = state.cart.length;
  const currentServices = new Map(state.services.map((service) => [service.id, service]));
  state.cart = state.cart
    .map((item) => {
      const updated = currentServices.get(item.id);
      return updated ? sanitizeServiceForCart(updated) : null;
    })
    .filter(Boolean);

  persistCart();

  if (state.cart.length !== previousLength) {
    state.selectedStartTime = "";
    showToast("Seu carrinho foi atualizado porque um ou mais serviços deixaram de estar disponíveis.", "error");
  }
}

async function submitBooking() {
  const validation = validateBookingBeforeSubmit();
  if (!validation.ok) {
    showToast(validation.message, "error");
    focusInvalidField(validation.focusTarget);
    return;
  }

  const totalDuration = getCartDuration();
  const totalPrice = getCartTotal();
  const endTime = getEndTime(state.selectedStartTime, totalDuration);
  const normalizedPhone = normalizePhone(state.customer.phone);
  const slotIds = buildSlotDocIds(state.selectedDate, state.selectedStartTime, endTime);

  setSubmitting(true, "Reservando horário e salvando pedido...");

  try {
    const bookingRef = doc(collection(db, "bookings"));
    const bookingId = await runTransaction(db, async (transaction) => {
      for (const slotId of slotIds) {
        const slotRef = doc(db, "scheduleLocks", slotId);
        const slotSnapshot = await transaction.get(slotRef);
        if (slotSnapshot.exists() && slotSnapshot.data().active) {
          throw new Error("Esse horário acabou de ser ocupado. Atualize a agenda e escolha outro.");
        }
      }

      const startTimestamp = createTimestampFromDateAndTime(state.selectedDate, state.selectedStartTime);
      const endTimestamp = createTimestampFromDateAndTime(state.selectedDate, endTime);

      const bookingPayload = {
        customerName: state.customer.name.trim(),
        customerPhone: formatPhone(normalizedPhone),
        customerPhoneDigits: normalizedPhone,
        notes: state.customer.notes.trim(),
        date: state.selectedDate,
        startTime: state.selectedStartTime,
        endTime,
        startTimestamp,
        endTimestamp,
        startMinuteOfDay: timeToMinutes(state.selectedStartTime),
        endMinuteOfDay: timeToMinutes(endTime),
        items: state.cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          durationMinutes: Number(item.durationMinutes)
        })),
        totalPrice,
        totalDurationMinutes: totalDuration,
        status: "pending",
        source: "site",
        timezone: TIMEZONE,
        lockIds: slotIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(bookingRef, bookingPayload);

      slotIds.forEach((slotId) => {
        const slotRef = doc(db, "scheduleLocks", slotId);
        transaction.set(slotRef, {
          active: true,
          type: "booking",
          bookingId: bookingRef.id,
          date: state.selectedDate,
          time: slotId.split("_")[1].replace(/(\d{2})(\d{2})/, "$1:$2"),
          slotGranularityMinutes: SLOT_GRANULARITY_MINUTES,
          startTime: state.selectedStartTime,
          endTime,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      return bookingRef.id;
    });

    const summary = {
      id: bookingId,
      customerName: state.customer.name.trim(),
      customerPhone: formatPhone(normalizedPhone),
      notes: state.customer.notes.trim() || "Nenhuma",
      date: state.selectedDate,
      startTime: state.selectedStartTime,
      endTime,
      items: [...state.cart],
      totalDurationMinutes: totalDuration,
      totalPrice
    };

    const whatsappUrl = buildWhatsAppUrl(summary);
    clearFlowAfterSuccess();

    showToast("Pedido salvo com sucesso. Abrindo o WhatsApp...");
    window.location.href = whatsappUrl;
  } catch (error) {
    console.error(error);
    showToast(error.message || "Não foi possível concluir o agendamento.", "error");
  } finally {
    setSubmitting(false);
  }
}

function validateBookingBeforeSubmit() {
  if (state.servicesStatus === "loading") {
    return { ok: false, message: "Aguarde o catálogo terminar de carregar.", focusTarget: "#services" };
  }

  if (state.servicesStatus === "error") {
    return { ok: false, message: "O catálogo está indisponível no momento. Atualize a página e tente novamente.", focusTarget: "#services" };
  }

  if (!state.cart.length) {
    return { ok: false, message: "Adicione pelo menos um serviço ao carrinho.", focusTarget: "#services" };
  }

  if (!state.selectedDate) {
    return { ok: false, message: "Selecione a data do atendimento.", focusTarget: "#bookingDate" };
  }

  if (!state.selectedStartTime) {
    return { ok: false, message: "Selecione um horário disponível.", focusTarget: "#timeSlots" };
  }

  if (!isStartTimeAvailable(state.selectedStartTime)) {
    return { ok: false, message: "O horário escolhido não está mais disponível.", focusTarget: "#timeSlots" };
  }

  if (!state.customer.name.trim()) {
    return { ok: false, message: "Informe seu nome completo.", focusTarget: "#customerName" };
  }

  if (!isValidBrazilPhone(state.customer.phone)) {
    return { ok: false, message: "Informe um telefone válido com WhatsApp.", focusTarget: "#customerPhone" };
  }

  return { ok: true };
}

function focusInvalidField(selector) {
  if (!selector) {
    return;
  }
  const element = document.querySelector(selector);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if ("focus" in element) {
      element.focus({ preventScroll: true });
    }
  }
}

function clearFlowAfterSuccess() {
  state.cart = [];
  state.selectedStartTime = "";
  persistCart();
  localStorage.removeItem(STORAGE_KEYS.customer);
  state.customer = { name: "", phone: "", notes: "" };
  applyCustomerStateToForm();
  renderAll();
}

function setSubmitting(isSubmitting, message = "Processando...") {
  state.isSubmitting = isSubmitting;
  refs.loadingText.textContent = message;
  refs.loadingOverlay.hidden = !isSubmitting;
  renderConfirmationSummary();
}

function applyCustomerStateToForm() {
  refs.customerName.value = state.customer.name || "";
  refs.customerPhone.value = state.customer.phone || "";
  refs.customerNotes.value = state.customer.notes || "";
}

function persistCart() {
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
}

function persistCustomer() {
  localStorage.setItem(STORAGE_KEYS.customer, JSON.stringify(state.customer));
}

function getCartDuration() {
  return state.cart.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0);
}

function getCartTotal() {
  return state.cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function getStartTimeOptions() {
  const start = timeToMinutes(state.settings.businessHoursStart);
  const end = timeToMinutes(state.settings.businessHoursEnd);
  const interval = Number(state.settings.intervalMinutes || 30);
  const options = [];

  for (let minute = start; minute < end; minute += interval) {
    options.push(minutesToTime(minute));
  }

  return options;
}

function isStartTimeAvailable(startTime) {
  if (!state.cart.length || !state.selectedDate || !startTime) {
    return false;
  }

  const totalDuration = getCartDuration();
  const startMinute = timeToMinutes(startTime);
  const endMinute = startMinute + totalDuration;
  const businessStart = timeToMinutes(state.settings.businessHoursStart);
  const businessEnd = timeToMinutes(state.settings.businessHoursEnd);

  if (startMinute < businessStart || endMinute > businessEnd) {
    return false;
  }

  const slotIds = buildSlotDocIds(state.selectedDate, startTime, minutesToTime(endMinute));
  return slotIds.every((slotId) => !state.activeLocks.has(slotId));
}

function getEndTime(startTime, durationMinutes) {
  return minutesToTime(timeToMinutes(startTime) + Number(durationMinutes || 0));
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

function buildWhatsAppUrl(summary) {
  const serviceLines = summary.items.map((item) => `- ${item.name}`).join("\n");

  const message = `${state.settings.whatsappIntro || DEFAULT_SETTINGS.whatsappIntro}

Nome: ${summary.customerName}
Telefone: ${summary.customerPhone}
Data: ${formatDateLong(summary.date)}
Horário de início: ${summary.startTime}
Horário estimado de término: ${summary.endTime}

Serviços:
${serviceLines}

Duração total: ${summary.totalDurationMinutes} minutos
Total: ${formatCurrency(summary.totalPrice)}

Observações: ${summary.notes}`;

  const whatsappNumber = normalizeWhatsAppNumber(state.settings.whatsappNumber || DEFAULT_WHATSAPP_NUMBER);
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function sanitizeServiceForCart(service) {
  return {
    id: service.id,
    name: service.name,
    description: service.description || "",
    price: Number(service.price || 0),
    durationMinutes: Number(service.durationMinutes || 0),
    active: Boolean(service.active)
  };
}

function createTimestampFromDateAndTime(date, time) {
  const value = new Date(`${date}T${time}:00${TIMEZONE_OFFSET}`);
  return Timestamp.fromDate(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDateLong(date) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
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
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && isValidBrazilPhone(digits)) {
    return `55${digits}`;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55") && isValidBrazilPhone(digits.slice(2))) {
    return digits;
  }
  return DEFAULT_WHATSAPP_NUMBER;
}

function normalizeSettings(data = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    timezone: TIMEZONE,
    whatsappNumber: normalizeWhatsAppNumber(data.whatsappNumber || DEFAULT_SETTINGS.whatsappNumber)
  };
}

function renderDisabledTimeState(message) {
  return `<div class="empty-state"><strong>Agenda indisponível.</strong><p>${escapeHtml(message)}</p></div>`;
}

function showToast(message, type = "success") {
  refs.toast.textContent = message;
  refs.toast.className = `toast is-visible ${type === "error" ? "is-error" : ""}`;

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    refs.toast.className = "toast";
  }, 2800);
}

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn("Falha ao ler storage", error);
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
