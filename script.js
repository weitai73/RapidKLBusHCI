/*
 * Rapid KL Service Control — HCI prototype.
 * All operations, users and route records below are fictional demo data.
 * Demo sign-in is intentionally client-side and is NOT production authentication.
 * No password is persisted and no requests are sent to Rapid KL.
 */
"use strict";

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const STORAGE_KEY = "rapidkl-service-control-v1";
  const SESSION_KEY = "rapidkl-demo-session-v1";
  const SCENARIO_TIME = 12 * 60 + 20;
  const DEMO_PASSWORD = "RapidDemo2026!";

  const routes = {
    D01: {
      name: "Central city loop", direction: "Eastbound", stop: "Central terminal", target: 10,
      buses: [
        {id:"RK102", planned:720, time:720, observed:true},
        {id:"RK118", planned:730, time:725, observed:true},
        {id:"RK136", planned:740, time:755, observed:false}
      ],
      title:"Long service gap forecast", reason:"Vehicle fault reported by the driver",
      description:"RK136 is not ready for its 12:20 departure. Its current estimate is 12:35, creating a 30-minute interval after RK118. Review the available information and request a replacement if one is available.",
      reported:"12:18", action:"replacement", owner:"Terminal controller",
      earlyDeparture:true
    },
    D02: {
      name:"West corridor", direction:"Inbound", stop:"West terminal", target:15,
      buses:[
        {id:"RK207", planned:710, time:710, observed:true},
        {id:"RK214", planned:725, time:725, observed:true},
        {id:"RK228", planned:740, time:740, observed:false}
      ],
      title:"No major service gap", reason:"Service following the intended interval",
      description:"The confirmed and forecast intervals match this route's 15-minute target.",
      reported:"12:19", action:"none", owner:"Terminal controller", earlyDeparture:false
    },
    D03: {
      name:"North connector", direction:"Southbound", stop:"North terminal", target:12,
      buses:[
        {id:"RK301", planned:698, time:698, observed:true},
        {id:"RK312", planned:710, time:710, observed:true},
        {id:"RK329", planned:722, time:745, observed:false}
      ],
      title:"Extended service gap", reason:"Late inbound vehicle; traffic reported",
      description:"The next vehicle is estimated to depart at 12:25. Review readiness with the depot and request an authorised dispatch adjustment. Passenger information should reflect the current estimate.",
      reported:"12:17", action:"adjustment", owner:"Terminal controller", earlyDeparture:false
    }
  };

  const freshState = () => ({
    version:1,
    routeStates:Object.fromEntries(Object.keys(routes).map(id => [id,{request:"none",acknowledged:false,note:""}])),
    activities:[], notices:{}, enquiries:[]
  });

  let state = freshState();
  let session = null;
  let selectedRoute = "D01";
  let activeIncident = null;
  let afterLogin = null;
  let requiredLoginRole = null;
  let toastTimeout;
  let memoryOnly = false;

  // Restore only recognised fields; a modified storage record must not break the page.
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1) {
      for (const id of Object.keys(routes)) {
        const entry = saved.routeStates?.[id];
        if (!entry) continue;
        if (["none","pending","approved","declined","completed"].includes(entry.request)) state.routeStates[id].request = entry.request;
        state.routeStates[id].acknowledged = entry.acknowledged === true;
        state.routeStates[id].note = typeof entry.note === "string" ? entry.note.slice(0,500) : "";
      }
      if (Array.isArray(saved.activities)) state.activities = saved.activities.filter(x => x && typeof x.title === "string" && typeof x.detail === "string").slice(0,30);
      if (Array.isArray(saved.enquiries)) state.enquiries = saved.enquiries.filter(x => x && typeof x.ticket === "string").slice(-50);
      for (const id of Object.keys(routes)) {
        if (typeof saved.notices?.[id]?.message === "string") state.notices[id] = {message:saved.notices[id].message.slice(0,400)};
      }
    }
  } catch (_) { /* Empty, unavailable or invalid storage: continue with a fresh scenario. */ }
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved && ["controller","supervisor"].includes(saved.role)) session = makeSession(saved.role);
  } catch (_) { /* Demo login lasts only for this page session if storage is unavailable. */ }

  function makeSession(role) {
    return {role,name:role === "supervisor" ? "Demo supervisor" : "Demo controller",email:`${role}@rapidkl.demo`};
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { memoryOnly = true; }
  }

  function notify(message) {
    clearTimeout(toastTimeout);
    $("#toast").textContent = message + (memoryOnly ? " Changes are available for this session only." : "");
    $("#toast").hidden = false;
    toastTimeout = setTimeout(() => { $("#toast").hidden = true; }, 5500);
  }

  function formatTime(minutes) {
    if (minutes == null) return "Not confirmed";
    return `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`;
  }

  function currentBuses(id) {
    const buses = routes[id].buses.map(bus => ({...bus}));
    if (state.routeStates[id].request === "completed") {
      // Only a separate, explicit confirmation changes the forecast into an observed departure.
      buses[2] = {...buses[2],id:routes[id].action === "replacement" ? "RK201" : buses[2].id,time:SCENARIO_TIME,observed:true};
    }
    return buses;
  }

  function routeAlerts(id) {
    const route = routes[id];
    const response = state.routeStates[id];
    const result = [];
    if (route.action !== "none" && response.request !== "completed") result.push({kind:"gap",title:route.title,description:`${id} · ${route.buses[2].id} · Estimated ${formatTime(route.buses[2].time)}`,state:response.request === "pending" ? "Awaiting supervisor review" : response.request === "approved" ? "Approved · departure not yet confirmed" : response.request === "declined" ? "Request declined · review next action" : "Action required"});
    if (route.earlyDeparture && !response.acknowledged) result.push({kind:"early",title:"Early departure recorded",description:`${id} · RK118 left 5 minutes early`,state:"Review and acknowledge"});
    return result;
  }

  function renderMetrics() {
    const route = routes[selectedRoute];
    const buses = currentBuses(selectedRoute);
    const departed = buses.filter(bus => bus.observed && bus.time <= SCENARIO_TIME);
    const lastTime = Math.max(...departed.map(bus => bus.time));
    const next = buses.find(bus => !bus.observed);
    const interval = buses[2].time - buses[1].time;
    const metrics = [
      {icon:"clock",label:"Target interval",value:route.target,unit:"min",hint:"For this route & direction"},
      {icon:"bus",label:"Since last departure",value:SCENARIO_TIME-lastTime,unit:"min",hint:`Last confirmed at ${formatTime(lastTime)}`,warning:SCENARIO_TIME-lastTime>route.target},
      {icon:"clock",label:"Next departure",value:next ? formatTime(next.time) : "—",unit:"",hint:next ? `Estimated · ${interval}-minute interval` : "No further estimate in this scenario",warning:!!next && interval>route.target*1.5},
      {icon:"alert",label:"Open service alerts",value:routeAlerts(selectedRoute).length,unit:"",hint:routeAlerts(selectedRoute).length ? "Review the prioritised queue" : "No open alerts in this scenario",warning:routeAlerts(selectedRoute).length>0}
    ];
    $("#metrics").innerHTML = metrics.map(m => `<div class="metric"><div class="metric-top">${icon(m.icon)}${m.label}</div><div class="metric-value">${m.value}<span>${m.unit}</span></div><div class="metric-hint${m.warning ? " warning" : ""}">${m.hint}</div></div>`).join("");
  }

  function renderIntervals() {
    const route = routes[selectedRoute];
    const buses = currentBuses(selectedRoute);
    const gaps = [buses[1].time-buses[0].time,buses[2].time-buses[1].time];
    const max = Math.ceil(Math.max(...gaps,route.target*2)/5)*5;
    const targetPosition = route.target/max*100;
    $("#interval-chart").innerHTML = gaps.map((gap,index) => `<div class="interval-row"><div class="interval-row-head"><span>${buses[index].id} → ${buses[index+1].id}</span><strong>${gap} min<small>${buses[index+1].observed ? "confirmed" : "forecast"}</small></strong></div><div class="interval-track"><div class="interval-bar${buses[index+1].observed ? "" : " forecast"}" style="width:${gap/max*100}%"></div><span class="interval-target" style="left:${targetPosition}%" aria-hidden="true"></span></div></div>`).join("") + `<div class="chart-scale"><span>0 min</span><span>${max/2} min</span><span>${max} min</span></div>`;
    $("#interval-chart").setAttribute("aria-label",`At ${route.stop}, ${route.direction}: target ${route.target} minutes. First interval ${gaps[0]} minutes confirmed. Second interval ${gaps[1]} minutes ${buses[2].observed ? "confirmed" : "forecast"}.`);
    const completed = state.routeStates[selectedRoute].request === "completed";
    $("#interval-insight p").textContent = completed
      ? `A departure was confirmed at ${formatTime(SCENARIO_TIME)} in the demo. The recorded interval is ${gaps[1]} minutes; a completed response does not automatically mean the service is back on target.`
      : gaps[1]>route.target*1.5
        ? `The next interval is forecast to be ${gaps[1]} minutes, compared with a ${route.target}-minute target. Open the alert to review the cause and next action.`
        : `The confirmed and forecast intervals match the ${route.target}-minute target. Continue monitoring for changes.`;
  }

  function renderAlerts() {
    const alerts = routeAlerts(selectedRoute);
    $("#alert-count").textContent = alerts.length;
    $("#alerts-list").innerHTML = alerts.length ? alerts.map(alert => `<article class="alert-item"><span class="alert-icon">${icon(alert.kind === "gap" ? "alert" : "clock")}</span><div><h4>${alert.title}</h4><p>${alert.description}</p><small>${alert.state}</small></div><button type="button" class="alert-review" data-review="${alert.kind}" aria-label="Review ${alert.title.toLowerCase()}">Review</button></article>`).join("") : `<div class="empty-alert">${icon("check")}<p>No open alerts for this route. Any recorded departures remain visible on the board.</p></div>`;
  }

  function renderDepartures() {
    const route = routes[selectedRoute];
    const buses = currentBuses(selectedRoute);
    const completed = state.routeStates[selectedRoute].request === "completed";
    $("#departures-body").innerHTML = buses.map((bus,index) => {
      const early = bus.observed && bus.time<bus.planned;
      const late = !bus.observed && bus.time>bus.planned;
      const status = early ? "Early departure" : late ? "Delayed" : bus.observed ? "Departed" : "On schedule";
      const incident = early ? "early" : late ? "gap" : "trip";
      return `<tr><td>${bus.id}<small>${selectedRoute} · ${index===2 && completed && route.action==="replacement" ? "Replacement" : "Trip "+(index+1)}</small></td><td>${formatTime(bus.planned)}</td><td>${formatTime(bus.time)}<small>${bus.observed ? "Confirmed" : "Estimated"}</small></td><td><span class="status-pill${early||late ? " warning" : ""}">${status}</span></td><td><button class="table-review" type="button" data-trip="${index}" data-kind="${incident}" aria-label="View ${bus.id} trip details">View</button></td></tr>`;
    }).join("");
  }

  function renderActivities() {
    const initial = [
      {time:"12:18",title:"Driver report received",detail:"D01 · RK136 · Vehicle fault"},
      {time:"12:17",title:"Late inbound vehicle reported",detail:"D03 · Depot readiness review needed"},
      {time:"12:05",title:"Early departure recorded",detail:"D01 · RK118 · 5 minutes early"}
    ];
    $("#activity-list").innerHTML = [...state.activities,...initial].slice(0,3).map(item => `<li><time>${escapeHTML(item.time || "12:20")} · DEMO</time><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail)}</p></li>`).join("");
  }

  function renderNotice() {
    const notice = state.notices[selectedRoute];
    $("#passenger-notice-heading").textContent = notice ? `${selectedRoute} · Service update preview` : "Keep everyone in the loop.";
    $("#passenger-notice-text").textContent = notice ? notice.message : "No service notice has been prepared. Staff can create an update from the dashboard.";
    $("#passenger-notice-time").textContent = notice ? "Saved at 12:20 MYT in the demo · Preview only, not sent to passengers." : "Demo notices appear here only; nothing is sent to passengers.";
  }

  function render() {
    $("#stop-context").innerHTML = `${routes[selectedRoute].stop}<small>Illustrative routes and times</small>`;
    renderMetrics(); renderIntervals(); renderAlerts(); renderDepartures(); renderActivities(); renderNotice();
    $("#login-button span").textContent = session ? (session.role === "supervisor" ? "Supervisor" : "Controller") : "Staff login";
    $("#login-button").setAttribute("aria-label",session ? `Open ${session.role} demo account` : "Open staff login");
  }

  function log(title,detail) {
    state.activities.unshift({time:"12:20",title,detail});
    state.activities = state.activities.slice(0,30);
    persist(); render();
  }

  function syncModalLock() { document.body.classList.toggle("modal-open",!!$("dialog[open]")); }
  function closeDialog(dialog) { dialog.close(); syncModalLock(); }
  function openDialog(dialog) {
    $$("dialog[open]").forEach(item => item.close());
    dialog.showModal(); syncModalLock();
  }

  function requireLogin(callback,role) {
    if (session && (!role || session.role===role)) { callback(); return; }
    afterLogin = callback;
    requiredLoginRole = role || null;
    $("#login-form").reset();
    if (role) $(`#login-form input[value="${role}"]`).checked = true;
    $("#login-error").hidden = true;
    $("#login-password").type = "password";
    $("#toggle-password").setAttribute("aria-pressed","false");
    $("#toggle-password").setAttribute("aria-label","Show password");
    openDialog($("#login-dialog"));
  }

  function openLogin(role) {
    afterLogin = null;
    requireLogin(() => notify(`Signed in as ${session.name.toLowerCase()}.`),role || null);
  }

  function openIncident(kind,tripIndex) {
    activeIncident = {routeId:selectedRoute,kind,tripIndex};
    renderIncident();
    openDialog($("#incident-dialog"));
  }

  function renderIncident() {
    if (!activeIncident) return;
    const {routeId:id,kind,tripIndex} = activeIncident;
    const route = routes[id];
    const response = state.routeStates[id];
    const buses = currentBuses(id);
    const intro = `<div class="eyebrow">${id} · ${route.direction} · SAMPLE INCIDENT</div>`;
    if (kind==="trip") {
      const bus = buses[tripIndex];
      $("#incident-content").innerHTML = `${intro}<h2 id="incident-title">${bus.id} trip details</h2><p>Trip information for ${route.stop}. All times below are illustrative.</p><dl class="incident-facts"><div><dt>Planned departure</dt><dd>${formatTime(bus.planned)}</dd></div><div><dt>${bus.observed ? "Confirmed departure" : "Current estimate"}</dt><dd>${formatTime(bus.time)}</dd></div><div><dt>Information type</dt><dd>${bus.observed ? "Observed in the demo" : "Forecast, not confirmed"}</dd></div></dl><button class="button button-outline" type="button" data-close>Close trip details</button>`;
      return;
    }
    if (kind==="early") {
      $("#incident-content").innerHTML = `${intro}<h2 id="incident-title">Early departure recorded</h2><div class="incident-description"><p>RK118 departed at 12:05 rather than its planned 12:10. Review this event and record a follow-up for the next dispatch briefing.</p></div><dl class="incident-facts"><div><dt>Planned / actual</dt><dd>12:10 / 12:05</dd></div><div><dt>Owner</dt><dd>Terminal controller</dd></div><div><dt>Review status</dt><dd>${response.acknowledged ? "Acknowledged" : "Awaiting review"}</dd></div></dl>${response.acknowledged ? '<div class="response-state"><strong>Review recorded</strong><small>The historical departure time has not changed.</small></div>' : '<label class="field-label" for="incident-note">Follow-up note (optional)</label><textarea id="incident-note" rows="3" maxlength="500" placeholder="For example: review departure timing at the next briefing."></textarea><button class="button button-dark full-width" type="button" data-action="acknowledge">Acknowledge & record follow-up</button>'}`;
      return;
    }
    const requestLabel = route.action==="replacement" ? "Request replacement bus" : "Request dispatch adjustment";
    let actions = "";
    if (["none","declined"].includes(response.request)) {
      actions = `${response.request==="declined" ? '<div class="response-state"><strong>Request declined</strong><small>'+escapeHTML(response.note || "Review another operational response.")+'</small></div>' : ""}<label class="field-label" for="incident-note">Response note (optional)</label><textarea id="incident-note" rows="3" maxlength="500" placeholder="Add useful context for the supervisor."></textarea><button type="button" class="button button-dark full-width" data-action="request">${requestLabel} ${icon("arrow")}</button>`;
    } else if (response.request==="pending") {
      actions = `<div class="response-state"><strong>Awaiting supervisor review</strong><small>${escapeHTML(response.note || "No additional note recorded.")} The forecast remains unchanged while this request is pending.</small></div>${session?.role==="supervisor" ? '<label class="field-label" for="incident-note">Supervisor note</label><textarea id="incident-note" rows="3" maxlength="500" placeholder="Record resource availability or a reason for declining."></textarea><p class="form-error" id="response-error" role="alert" hidden></p><div class="incident-actions"><button type="button" class="button button-outline" data-action="decline">Decline request</button><button type="button" class="button button-dark" data-action="approve">Approve response</button></div>' : '<button type="button" class="button button-outline full-width" data-action="supervisor-login">Review as demo supervisor</button>'}`;
    } else if (response.request==="approved") {
      actions = `<div class="response-state"><strong>Response approved</strong><small>${escapeHTML(response.note || "Supervisor approval recorded.")} The trip is still a forecast until departure is confirmed.</small></div>${session?.role==="controller" ? '<button type="button" class="button button-dark full-width" data-action="confirm">Confirm departure at 12:20 (demo)</button><p class="response-caption">This explicitly records a sample departure. Only this confirmation changes the interval and departure board.</p>' : '<button type="button" class="button button-outline full-width" data-action="controller-login">Continue as demo controller</button>'}`;
    } else {
      actions = `<div class="response-state"><strong>Departure confirmed in the demo</strong><small>${buses[2].id} departed at 12:20. The recorded interval was ${SCENARIO_TIME-buses[1].time} minutes. Review the next services before declaring normal operation.</small></div>`;
    }
    const resolved = response.request === "completed";
    const heading = resolved ? "Departure confirmed" : route.title;
    const description = resolved
      ? `The response is complete in this sample scenario. ${buses[2].id} departed at 12:20. The original vehicle report is retained below, and further service intervals still need monitoring.`
      : route.description;
    $("#incident-content").innerHTML = `${intro}<h2 id="incident-title">${heading}</h2><div class="incident-meta"><span>${buses[2].id}</span><span>Target ${route.target} min</span><span>${route.stop}</span></div><div class="incident-description"><p>${description}</p></div><dl class="incident-facts"><div><dt>${resolved ? "Original driver report" : "Driver report"}</dt><dd>${route.reason}</dd></div><div><dt>Report received</dt><dd>${route.reported} MYT · demo</dd></div><div><dt>Assigned to</dt><dd>${route.owner}</dd></div></dl>${actions}<button class="text-button full-width" type="button" data-action="notice">Prepare a passenger notice</button>`;
  }

  function runIncidentAction(action) {
    const incident = {...activeIncident};
    const id = incident.routeId;
    const response = state.routeStates[id];
    const note = $("#incident-note")?.value.trim() || "";
    if (action==="supervisor-login" || action==="controller-login") {
      const role = action==="supervisor-login" ? "supervisor" : "controller";
      requireLogin(() => { activeIncident = incident; renderIncident(); openDialog($("#incident-dialog")); },role);
      return;
    }
    if (action==="notice") { prepareNotice(); return; }
    const role = ["approve","decline"].includes(action) ? "supervisor" : "controller";
    if (action==="decline" && !note) {
      $("#response-error").textContent = "Add a reason before declining the request.";
      $("#response-error").hidden = false;
      $("#incident-note").focus(); return;
    }
    requireLogin(() => {
      activeIncident = incident;
      if (action==="acknowledge" && !response.acknowledged) {
        response.acknowledged = true; response.note = note;
        log("Early departure reviewed",`${id} · ${note || "Follow-up recorded for the next dispatch briefing."}`);
        notify("Review recorded. The historical departure time stays unchanged.");
      } else if (action==="request" && ["none","declined"].includes(response.request)) {
        response.request = "pending"; response.note = note;
        log(routes[id].action==="replacement" ? "Replacement requested" : "Dispatch adjustment requested",`${id} · Awaiting supervisor review`);
        notify("Demo request recorded. Supervisor review is required.");
      } else if (action==="approve" && response.request==="pending") {
        response.request = "approved"; response.note = note;
        log("Operational response approved",`${id} · Awaiting departure confirmation`);
        notify("Response approved. The departure forecast has not changed.");
      } else if (action==="decline" && response.request==="pending") {
        response.request = "declined"; response.note = note;
        log("Response request declined",`${id} · ${note}`);
        notify("Decision and reason recorded.");
      } else if (action==="confirm" && response.request==="approved") {
        response.request = "completed";
        log("Departure confirmed",`${id} · ${routes[id].action==="replacement" ? "Replacement RK201" : "RK329"} departed at 12:20 (demo)`);
        notify("Sample departure confirmed. The board and interval have been updated.");
      }
      renderIncident(); openDialog($("#incident-dialog"));
    },role);
  }

  function prepareNotice() {
    requireLogin(() => {
      const route = routes[selectedRoute];
      const lastBus = currentBuses(selectedRoute)[2];
      const saved = state.notices[selectedRoute];
      $("#notice-message").value = saved?.message || (lastBus.observed
        ? `${selectedRoute} · ${route.name} (${route.direction}): the delayed trip departed at ${formatTime(lastBus.time)}. Further departure information will be provided when confirmed.`
        : route.action==="none"
          ? `${selectedRoute} · ${route.name} (${route.direction}): services are following the intended ${route.target}-minute interval in this sample scenario. The next departure is estimated at ${formatTime(lastBus.time)}.`
          : `${selectedRoute} · ${route.name} (${route.direction}): a longer interval between buses is expected. The next departure is currently estimated at ${formatTime(lastBus.time)}. This estimate may change. Thank you for your patience.`);
      openDialog($("#notice-dialog"));
    });
  }

  // Native dialogs provide focus containment and Escape-to-close behaviour.
  $$("dialog").forEach(dialog => {
    dialog.addEventListener("close",syncModalLock);
    dialog.addEventListener("click",event => {
      if (event.target.closest("[data-close]")) closeDialog(dialog);
      else if (event.target===dialog) {
        const box = dialog.getBoundingClientRect();
        if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) closeDialog(dialog);
      }
    });
  });

  $("#route-select").addEventListener("change",event => { selectedRoute = event.target.value; render(); });
  $("#alerts-list").addEventListener("click",event => { const button = event.target.closest("[data-review]"); if (button) openIncident(button.dataset.review); });
  $("#departures-body").addEventListener("click",event => { const button = event.target.closest("[data-trip]"); if (button) openIncident(button.dataset.kind,Number(button.dataset.trip)); });
  $("#incident-content").addEventListener("click",event => { const button = event.target.closest("[data-action]"); if (button) runIncidentAction(button.dataset.action); });

  $("#login-button").addEventListener("click",() => {
    if (!session) { openLogin(); return; }
    $("#account-info").innerHTML = `<div class="account-card"><strong>${session.name}</strong><span>${session.email}</span><small>${session.role==="supervisor" ? "Review and approve operational requests." : "Monitor services, request responses and confirm departures."}</small></div><p>Switch roles by logging out and using the other demo account. These are demonstration accounts only.</p>`;
    openDialog($("#account-dialog"));
  });
  $("#fill-credentials").addEventListener("click",() => {
    const role = $('#login-form input[name="role"]:checked').value;
    $("#login-email").value = `${role}@rapidkl.demo`;
    $("#login-password").value = DEMO_PASSWORD;
    $("#login-error").hidden = true;
  });
  $$('#login-form input[name="role"]').forEach(input => input.addEventListener("change",() => {
    $("#login-email").value = ""; $("#login-password").value = ""; $("#login-error").hidden = true;
  }));
  $("#toggle-password").addEventListener("click",() => {
    const show = $("#login-password").type === "password";
    $("#login-password").type = show ? "text" : "password";
    $("#toggle-password").setAttribute("aria-label",show ? "Hide password" : "Show password");
    $("#toggle-password").setAttribute("aria-pressed",String(show));
  });
  $("#login-form").addEventListener("submit",event => {
    event.preventDefault();
    const role = $('#login-form input[name="role"]:checked').value;
    if ($('#login-email').value.trim().toLowerCase()!==`${role}@rapidkl.demo` || $('#login-password').value!==DEMO_PASSWORD) {
      $("#login-error").textContent = "Use Fill demo credentials for the selected role, then log in.";
      $("#login-error").hidden = false; return;
    }
    if (requiredLoginRole && role !== requiredLoginRole) {
      $("#login-error").textContent = `This action requires the ${requiredLoginRole} demo account. Choose that role and fill its demo credentials.`;
      $("#login-error").hidden = false; return;
    }
    session = makeSession(role);
    try { sessionStorage.setItem(SESSION_KEY,JSON.stringify({role})); } catch (_) { /* Retain in memory. */ }
    $("#login-password").value = "";
    closeDialog($("#login-dialog")); render();
    const callback = afterLogin; afterLogin = null; requiredLoginRole = null;
    if (callback) callback(); else notify(`Signed in as ${session.name.toLowerCase()}.`);
  });
  $("#logout-button").addEventListener("click",() => {
    session = null; afterLogin = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* Session is already cleared in memory. */ }
    closeDialog($("#account-dialog")); render(); notify("You have logged out of the demo account.");
  });

  $("#passenger-update-button").addEventListener("click",prepareNotice);
  $("#notice-form").addEventListener("submit",event => {
    event.preventDefault();
    const message = $("#notice-message").value.trim();
    if (message.length<15) { $("#notice-message").setCustomValidity("Write at least 15 characters."); $("#notice-message").reportValidity(); return; }
    state.notices[selectedRoute] = {message};
    log("Passenger notice preview saved",`${selectedRoute} · Demo only; no messages sent`);
    closeDialog($("#notice-dialog"));
    notify("Notice preview saved below the dashboard. Nothing was sent to passengers.");
  });
  $("#notice-message").addEventListener("input",event => event.target.setCustomValidity(""));

  $("#support-button").addEventListener("click",() => {
    $("#support-form").reset(); $("#support-form").hidden = false; $("#enquiry-success").hidden = true;
    openDialog($("#support-dialog"));
  });
  $("#support-form").addEventListener("submit",event => {
    event.preventDefault();
    const message = $("#enquiry-message").value.trim();
    if (message.length<10) { $("#enquiry-message").setCustomValidity("Write at least 10 characters."); $("#enquiry-message").reportValidity(); return; }
    const ticket = `DEMO-${String(state.enquiries.length+1).padStart(4,"0")}`;
    state.enquiries.push({ticket,topic:$("#enquiry-topic").value,message}); persist();
    $("#support-form").hidden = true;
    $("#enquiry-success").innerHTML = `<strong>Demo enquiry saved · ${ticket}</strong><p>This record stays on this device and has not been sent to Rapid KL. For actual assistance, use 03-7885 2585 or suggest@rapidkl.com.my.</p>`;
    $("#enquiry-success").hidden = false;
  });
  $("#enquiry-message").addEventListener("input",event => event.target.setCustomValidity(""));
  $("#privacy-button").addEventListener("click",() => openDialog($("#about-dialog")));
  $("#reset-demo").addEventListener("click",() => openDialog($("#reset-dialog")));
  $("#confirm-reset").addEventListener("click",() => {
    state = freshState(); persist(); render(); closeDialog($("#reset-dialog")); notify("Demo responses, notices and enquiries have been reset.");
  });

  $("#mobile-menu").addEventListener("click",() => {
    const expanded = $("#mobile-menu").getAttribute("aria-expanded")!=="true";
    $("#mobile-menu").setAttribute("aria-expanded",String(expanded));
    $("#mobile-menu").setAttribute("aria-label",expanded ? "Close navigation" : "Open navigation");
    $("#main-nav").classList.toggle("is-open",expanded);
  });
  $$(".nav-link").forEach(link => link.addEventListener("click",() => {
    $("#main-nav").classList.remove("is-open"); $("#mobile-menu").setAttribute("aria-expanded","false"); $("#mobile-menu").setAttribute("aria-label","Open navigation");
  }));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio-a.intersectionRatio)[0];
      if (!visible) return;
      $$(".nav-link").forEach(link => {
        const active = link.getAttribute("href")===`#${visible.target.id}`;
        link.classList.toggle("active",active);
        if (active) link.setAttribute("aria-current","location"); else link.removeAttribute("aria-current");
      });
    },{rootMargin:"-100px 0px -45% 0px",threshold:[0,.1,.3]});
    $$("main>section[id]").forEach(section => observer.observe(section));
  }
  render();
})();
