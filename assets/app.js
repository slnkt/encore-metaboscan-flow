/* Прототип пути клиента МетабоСкан. Весь контент в data.js (window.PRESENTATION).
   Экраны строятся из состояния и перерисовываются при каждом действии. */
(function () {
  "use strict";
  var D = window.PRESENTATION;
  if (!D) return;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // [ЗАПОЛНИТЬ: ...] и пустые значения превращаются в плашку
  function t(v, hint) {
    if (v == null || v === "") return '<span class="todo">[ЗАПОЛНИТЬ' + (hint ? ": " + esc(hint) : "") + "]</span>";
    var s = String(v);
    if (/^\[ЗАПОЛНИТЬ/.test(s.trim())) return '<span class="todo">' + esc(s) + "</span>";
    return esc(s).replace(/\[ЗАПОЛНИТЬ[^\]]*\]/g, function (m) { return '<span class="todo">' + m + "</span>"; });
  }
  function ic(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  var STATUSBAR = '<div class="statusbar"><span>9:41</span><span class="ic">' + ic("i-sig") + ic("i-wifi") + ic("i-batt") + "</span></div>";
  function num(x) {
    if (x == null || isNaN(x)) return "—";
    var a = Math.abs(x), d = a >= 100 ? 1 : a >= 10 ? 2 : 3;
    return String(+x.toFixed(d)).replace(".", ",");
  }

  /* ---------- dates ---------- */
  var WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var WDF = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  var MS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var today = new Date();
  var DATES = [1, 2, 3].map(function (k) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + k);
    return { wd: WD[d.getDay()], day: d.getDate(), mon: MS[d.getMonth()], full: d.getDate() + " " + MG[d.getMonth()] + " " + d.getFullYear() + " г.", date: d };
  });
  function lockDate(offset) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return WDF[d.getDay()] + ", " + d.getDate() + " " + MG[d.getMonth()];
  }

  /* ---------- metabolites ---------- */
  var METS = null, METS_ERR = false;
  function statusOf(z) {
    var a = Math.abs(z);
    if (a >= 2) return { key: "strong", name: "Выраженный сдвиг", pill: "red" };
    if (a >= 1.3) return { key: "border", name: "Пограничный сдвиг", pill: "orange" };
    return { key: "norm", name: "В норме", pill: "green" };
  }
  function scalePos(z) { return Math.max(4, Math.min(96, 50 + z * 12.5)); }

  /* ---------- steps: screens + communications ---------- */
  var STEPS = [];
  D.screens.forEach(function (s) {
    STEPS.push({ kind: "screen", id: s.id, stage: s.stage, title: s.title, cap: s.cap });
    (D.comms || []).forEach(function (c, ci) {
      if (c.after === s.id) {
        var f = (D.formats || {})[c.format] || { name: c.format };
        STEPS.push({ kind: "comm", id: "comm-" + ci, comm: c, stage: s.stage, title: f.name + ": " + c.moment, cap: commCap(c, f) });
      }
    });
  });
  function commCap(c, f) {
    var what = { email: "Клиенту приходит письмо", push: "Клиенту приходит пуш", sms: "Клиенту приходит SMS" }[c.format] || "Клиенту приходит сообщение";
    return what + (c.attachment ? " с PDF-отчетом" : "") + ". Нажмите на уведомление, чтобы открыть текст.";
  }
  function idx(id) { for (var k = 0; k < STEPS.length; k++) if (STEPS[k].id === id) return k; return 0; }

  /* ---------- state ---------- */
  var S = {
    i: 0,
    variant: 0,
    promo: D.product.promo || "",
    promoApplied: !!D.product.promo,
    consents: (D.consents || []).map(function () { return false; }),
    qPage: 0,
    answers: {},
    date: 0,
    slot: 0,
    hideNorm: false,
    param: null,
    paramFrom: "list",
    pdTab: 0,
    ntfOpen: false
  };

  /* ---------- screens ---------- */
  var C = D.client || {};
  function tophead(kind) {
    return '<div class="tophead">' + (kind === "burger" ? '<div class="burger"><i></i><i></i><i></i></div>' : '<div class="av">' + esc(C.initials || "") + "</div>") + "</div>";
  }
  function lkHead() {
    return '<div class="lk-hi">Добро пожаловать, <span>' + esc(C.name || "") + '</span></div><div class="lk-chip">' + esc(D.product.name) + " ▾</div>";
  }
  function visitKv() {
    return '<div class="kv"><b>Выезд медсестры</b><br>' + esc(C.address) + "<br>Дата визита: " + esc(DATES[S.date].full) + "<br>Время: " + esc(D.booking.slots[S.slot]) + "</div>";
  }
  function requiredOk() {
    return (D.consents || []).every(function (c, k) { return !c.required || S.consents[k]; });
  }

  var R = {};

  R.checkout = function () {
    var v = D.product.variants[S.variant];
    var inc = (D.product.includes || {})[v] || [];
    return STATUSBAR + tophead("burger") + '<div class="body">' +
      '<h2 class="h2s">Оформление заказа</h2><div style="height:12px"></div>' +
      '<div class="seg full" role="radiogroup" aria-label="Вариант">' + D.product.variants.map(function (name, k) {
        return '<button type="button" role="radio" aria-checked="' + (k === S.variant) + '" class="' + (k === S.variant ? "on" : "") + '" data-act="variant" data-v="' + k + '">' + esc(name) + "</button>";
      }).join("") + "</div>" +
      '<div class="order-item"><div><b>' + esc(D.product.name) + '</b><span class="os">' + esc(v) + "</span></div></div>" +
      '<div class="promo"><input id="promoInp" aria-label="Промокод" placeholder="Промокод" value="' + esc(S.promo) + '"><button type="button" class="ap" data-act="promo">Применить</button></div>' +
      promoNote() +
      '<div class="order-list">' + inc.map(function (x) { return '<div class="ol">' + esc(x) + "</div>"; }).join("") +
      '<div class="order-total"><span class="l">Сумма</span><span class="v">' + t(D.product.total) + "</span></div></div>" +
      (D.consents || []).map(function (c, k) {
        return '<button type="button" class="consent" role="checkbox" aria-checked="' + S.consents[k] + '" data-act="consent" data-k="' + k + '"><span class="cb' + (S.consents[k] ? " on" : "") + '">' + (S.consents[k] ? ic("i-check") : "") + "</span><span>" + esc(c.label) + '<span class="rq">' + (c.required ? "обязательно" : "необязательно") + "</span></span></button>";
      }).join("") +
      '<div class="bottom"><button type="button" class="btn" data-act="next"' + (requiredOk() ? "" : " disabled") + ">Оформить заказ</button></div></div>";
  };
  function promoNote() {
    return '<div class="promo-ok' + (S.promoApplied ? "" : " no") + '" id="promoNote">' + (S.promoApplied ? ic("i-check") + "Промокод применен" : "Промокод не применен") + "</div>";
  }

  R.auth = function () {
    return '<div class="screen-inner s-auth" style="display:flex;flex-direction:column;height:100%">' + STATUSBAR +
      '<div class="body" style="justify-content:center;overflow:hidden;padding:0"><div class="auth-modal">' +
      '<div class="auth-head"><h3>' + esc(D.auth.title) + '</h3><span class="auth-x">✕</span></div>' +
      '<p class="auth-sub">' + esc(D.auth.text) + "</p>" +
      '<div class="auth-field"><span class="lb">Ваш email или номер телефона</span></div>' +
      '<button type="button" class="auth-btn yid" style="width:100%;border:none;font-family:var(--font)" data-act="next">Войти</button>' +
      "</div></div></div>";
  };

  R.ordered = function () {
    return STATUSBAR + '<div class="thanks">' +
      '<span class="chip-ok">' + ic("i-check") + "Оплата прошла</span>" +
      "<h2>Следующий шаг:<br>анкета</h2>" +
      "<p>" + esc(D.questionnaire.intro) + "</p>" +
      '<button type="button" class="btn" data-act="next">Заполнить анкету</button></div>';
  };

  R.quest = function () {
    var bl = D.questionnaire.blocks, n = bl.length, p = Math.min(S.qPage, n - 1), b = bl[p];
    var pct = Math.round(((p + 1) / n) * 100);
    return STATUSBAR + tophead() + '<div class="body">' +
      '<h2 class="h2s">Анкета</h2>' +
      '<div class="q-prog" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="q-cnt">Блок ' + (p + 1) + " из " + n + "</div>" +
      '<div class="cap-h">' + esc(b.title) + "</div>" +
      b.fields.map(function (f, fi) {
        var key = p + "-" + fi, val = S.answers[key];
        if (f.type === "choice") {
          return '<div class="q-lbl">' + esc(f.label) + '</div><div class="q-opts" role="radiogroup" aria-label="' + esc(f.label) + '">' + f.options.map(function (o, oi) {
            return '<button type="button" role="radio" aria-checked="' + (val === oi) + '" class="slot' + (val === oi ? " on" : "") + '" data-act="qopt" data-key="' + key + '" data-o="' + oi + '">' + esc(o) + "</button>";
          }).join("") + "</div>";
        }
        return '<label class="fld"><span class="lb">' + esc(f.label) + '</span><input data-key="' + key + '" placeholder="' + esc(f.placeholder || "") + '" value="' + esc(val || "") + '"></label>';
      }).join("") +
      '<div class="bottom"><button type="button" class="btn" data-act="qnext">Далее</button>' +
      (p > 0 ? '<button type="button" class="link" data-act="qback">Назад</button>' : "") + "</div></div>";
  };

  R.booking = function () {
    return STATUSBAR + tophead() + '<div class="body">' +
      '<h2 class="h2s">' + esc(D.booking.title) + "</h2>" +
      '<p class="sub">' + esc(C.name) + ", " + esc(D.booking.text.charAt(0).toLowerCase() + D.booking.text.slice(1)) + "</p>" +
      '<div class="fld"><span class="lb">Адрес</span><b>' + esc(C.address) + "</b></div>" +
      '<div class="map"><svg class="bg" viewBox="0 0 280 82" preserveAspectRatio="none"><rect width="280" height="82" fill="#F1F4F6"/><path d="M-5 58 L70 50 L145 62 L285 42" stroke="#fff" stroke-width="9" fill="none"/><path d="M58 -5 L74 87" stroke="#fff" stroke-width="6"/><path d="M185 -5 L165 87" stroke="#fff" stroke-width="11"/><path d="M-5 20 L285 13" stroke="#fff" stroke-width="5"/><ellipse cx="235" cy="66" rx="34" ry="16" fill="#D6E9DE"/><ellipse cx="30" cy="12" rx="26" ry="12" fill="#D6E9DE"/></svg>' +
      '<span class="open"><svg viewBox="0 0 10 12"><path d="M5 0a5 5 0 0 1 5 5c0 3.5-5 7-5 7S0 8.5 0 5a5 5 0 0 1 5-5z" fill="#E14C4C"/><circle cx="5" cy="5" r="2" fill="#fff"/></svg>Адрес на карте</span></div>' +
      '<div class="cap-h">Дата визита</div><div class="date-chips" role="radiogroup" aria-label="Дата визита">' + DATES.map(function (d, k) {
        return '<button type="button" role="radio" aria-checked="' + (k === S.date) + '" class="date-chip' + (k === S.date ? " on" : "") + '" data-act="date" data-k="' + k + '">' + d.wd + "<b>" + d.day + "</b>" + d.mon + "</button>";
      }).join("") + "</div>" +
      '<div class="cap-h mt">Время</div><div class="slots" role="radiogroup" aria-label="Время">' + D.booking.slots.map(function (s, k) {
        return '<button type="button" role="radio" aria-checked="' + (k === S.slot) + '" class="slot' + (k === S.slot ? " on" : "") + '" data-act="slot" data-k="' + k + '">' + esc(s) + "</button>";
      }).join("") + "</div>" +
      '<div class="bottom"><button type="button" class="btn" data-act="next">Оставить заявку</button></div></div>';
  };

  R.created = function () {
    return STATUSBAR + '<div class="thanks">' +
      '<div class="ok-ring">' + ic("i-check") + "</div>" +
      "<h2>Заявка создана!</h2><p>Подтверждение придет в личный кабинет и на почту</p>" +
      '<div class="kv-card"><div class="k">Адрес</div>' + esc(C.address) +
      '<div class="k">Дата визита</div>' + esc(DATES[S.date].full) +
      '<div class="k">Время</div>' + esc(D.booking.slots[S.slot]) + "</div>" +
      '<button type="button" class="btn" data-act="next">В личный кабинет</button></div>';
  };

  function lk(inner) { return STATUSBAR + tophead() + '<div class="body">' + lkHead() + inner + "</div>"; }

  R.pending = function () {
    return lk('<div class="lk-card"><span class="st-flag red">' + ic("i-clock") + "Ожидает подтверждения</span>" +
      '<div class="h">Выезд медсестры</div><div class="d">Заявка на выезд медсестры ожидает подтверждения</div>' + visitKv() +
      '<div class="links"><button type="button" class="link">Отменить запись</button></div></div>');
  };

  R.confirmed = function () {
    var memo = D.prep.memo ? '<a class="pilllink" href="' + esc(D.prep.memo) + '" target="_blank" rel="noopener">Открыть памятку</a>' : t(null, "памятка");
    return lk('<div class="lk-card"><span class="st-flag green">' + ic("i-check") + "Подтверждено</span>" +
      '<div class="h">Выезд медсестры</div><div class="d">Выезд медсестры подтвержден</div>' + visitKv() + "</div>" +
      '<div class="rec-card"><div class="rec-title">' + esc(D.prep.title) + '</div><ol class="rec-list">' +
      D.prep.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" + memo + "</div>" +
      '<div style="margin:12px 0 6px"><button type="button" class="link">Отменить запись</button></div>');
  };

  R.processing = function () {
    return lk('<div class="lk-card"><span class="st-flag orange">' + ic("i-refresh") + "Результаты в обработке</span>" +
      '<div class="h">' + esc(D.results.title) + '</div><div class="d">' + esc(D.results.term) + "</div></div>");
  };

  function pdfButton() {
    if (D.results.reportPdf) return '<a class="pilllink" href="' + esc(D.results.reportPdf) + '" target="_blank" rel="noopener">Скачать PDF</a>';
    return '<span class="pilllink" aria-disabled="true">Скачать PDF</span><div class="d pd-todo">' + t(D.results.reportTodo) + "</div>";
  }

  R.ready = function () {
    return lk('<div class="lk-card"><span class="st-flag green">' + ic("i-check") + "Готово</span>" +
      '<div class="h">' + esc(D.results.title) + '</div><div class="d">Пациентский отчет и оцифрованные результаты</div>' +
      '<div class="acts">' + pdfButton() + '<button type="button" class="btn" data-act="go" data-to="summary">Смотреть результаты</button></div></div>');
  };

  function metricCard(m, k, plain) {
    var st = statusOf(m.z);
    return '<button type="button" class="metric' + (plain ? " plain" : "") + '" data-act="param" data-k="' + k + '">' +
      '<div class="top"><span class="nm">' + esc(m.name) + '</span><span class="pill ' + st.pill + '">' + st.name + "</span></div>" +
      '<div class="ref">Референсное значение лаборатории ' + num(m.refMin) + " – " + num(m.refMax) + " " + esc(m.unit) + "</div>" +
      '<div class="val">' + num(m.value) + " <small>" + esc(m.unit) + "</small></div>" +
      '<div class="scale"><span class="pt" style="left:' + scalePos(m.z) + '%"></span></div>' +
      '<div class="scale-lbl"><span>Низкий</span><span>Высокий</span></div>' +
      (plain ? "" : '<div style="margin-top:9px"><span class="link">Смотреть параметр</span></div>') + "</button>";
  }
  function noData() {
    return '<div class="res-err">' + (METS_ERR ? "Не удалось загрузить результаты." : "Загружаем результаты…") + "</div>";
  }

  R.summary = function () {
    var body = noData();
    if (METS) {
      var cnt = { strong: 0, border: 0, norm: 0 };
      METS.forEach(function (m) { cnt[statusOf(m.z).key]++; });
      var strong = METS.map(function (m, k) { return { m: m, k: k }; }).filter(function (x) { return statusOf(x.m.z).key === "strong"; });
      body = '<div class="res-sum"><span class="pill lg red">Выраженный сдвиг: ' + cnt.strong + '</span><span class="pill lg orange">Пограничный: ' + cnt.border + '</span><span class="pill lg green">В норме: ' + cnt.norm + "</span></div>" +
        '<div class="res-wrap"><div class="rw-t">Выраженный сдвиг</div><div class="rw-s">Показатели, которые сильнее всего отличаются от референса</div>' +
        strong.map(function (x) { return metricCard(x.m, x.k, true); }).join("") +
        '<button type="button" class="pilllink" style="background:#fff" data-act="go" data-to="list">Смотреть все параметры</button></div>';
    }
    return STATUSBAR + tophead("burger") + '<div class="body"><h2 class="h2s">' + esc(D.results.title) + '</h2><p class="sub">Сначала показатели с выраженным сдвигом</p>' + body + '<div style="height:16px"></div></div>';
  };

  R.list = function () {
    var body = noData();
    if (METS) {
      var items = METS.map(function (m, k) { return { m: m, k: k }; }).filter(function (x) { return !S.hideNorm || statusOf(x.m.z).key !== "norm"; });
      body = '<button type="button" class="hide-opt" role="checkbox" aria-checked="' + S.hideNorm + '" data-act="hide"><span class="cb' + (S.hideNorm ? " on" : "") + '">' + (S.hideNorm ? ic("i-check") : "") + "</span>скрыть в норме</button>" +
        '<div class="checkup-row"><div><b>' + esc(D.product.name) + '</b><span class="dt">' + METS.length + " показателей</span></div></div>" +
        items.map(function (x) { return metricCard(x.m, x.k, false); }).join("");
    }
    return STATUSBAR + tophead("burger") + '<div class="body"><h2 class="h2s">Все показатели</h2><p class="sub">Статус по отклонению от референса лаборатории</p>' + body + '<div style="height:16px"></div></div>';
  };

  function defaultParam() {
    if (!METS) return null;
    for (var k = 0; k < METS.length; k++) if (METS[k].subtitle) return k;
    return 0;
  }

  R.param = function () {
    if (!METS) return STATUSBAR + '<div class="body">' + noData() + "</div>";
    var k = S.param == null ? defaultParam() : S.param, m = METS[k], st = statusOf(m.z);
    var now = '<div class="pd-ref-row"><div class="pd-ref">Референсное значение лаборатории<br>' + num(m.refMin) + " – " + num(m.refMax) + " " + esc(m.unit) + '</div><span class="pd-i">i</span></div>' +
      '<div class="pd-val">' + num(m.value) + " <small>" + esc(m.unit) + "</small></div>" +
      '<div class="scale"><span class="pt" style="left:' + scalePos(m.z) + '%"></span></div>' +
      '<div class="scale-lbl"><span>Низкий</span><span>Высокий</span></div>' +
      '<div class="pd-st"><span class="pill lg ' + st.pill + '">' + st.name + "</span></div>" +
      '<div class="pd-div"></div><h3 class="pd-h3">Что это за показатель</h3>' +
      '<p class="pd-desc" style="padding-bottom:16px">' + t(m.subtitle, "описание показателя") + "</p>";
    var dyn = '<div class="empty-dyn">' + ic("i-info") + esc(D.results.dynamicsNote) + "</div>";
    return STATUSBAR + '<div class="pd-head"><span class="pd-name">' + esc(m.name) + '</span><button type="button" class="pd-x" aria-label="Закрыть" data-act="pclose">✕</button></div>' +
      '<div class="body"><h2 class="h2s">Результат параметра</h2><div style="height:12px"></div>' +
      '<div class="seg" style="margin-bottom:16px"><button type="button" class="' + (S.pdTab === 0 ? "on" : "") + '" data-act="pdtab" data-k="0">Сейчас</button><button type="button" class="off' + (S.pdTab === 1 ? " on" : "") + '" data-act="pdtab" data-k="1">Динамика</button></div>' +
      (S.pdTab === 0 ? now : dyn) + "</div>";
  };

  R.retake = function () {
    return lk('<div class="lk-card"><span class="st-flag red">' + ic("i-info") + "Требуется пересдача</span>" +
      '<div class="h">Выезд медсестры</div><div class="d">' + esc(D.retake.text) + "</div>" +
      '<div class="kv"><b>Причина</b><br>' + t(D.retake.reason) + "</div>" +
      '<div class="acts"><button type="button" class="btn" data-act="go" data-to="booking">Записаться повторно</button></div></div>');
  };

  /* ---------- communications ---------- */
  var DAY_OFFSET = { created: 0, confirmed: 0, ready: 7 };
  function renderComm(step) {
    var c = step.comm, f = (D.formats || {})[c.format] || { name: c.format, sender: "Bioniq", app: "" };
    var icon = c.format === "push" ? ic("i-bq") : c.format === "sms" ? ic("i-msg") : ic("i-mail");
    if (c.format === "email" && S.ntfOpen) return renderMail(c, f);
    var off = c.moment && /накануне/i.test(c.moment) ? S.date : (DAY_OFFSET[c.after] || 0);
    return '<div class="screen-inner s-lock" style="display:flex;flex-direction:column;height:100%">' + STATUSBAR +
      '<div class="lock-time"><div class="d">' + esc(lockDate(off)) + '</div><div class="t">9:41</div></div>' +
      '<button type="button" class="ntf' + (S.ntfOpen ? " open" : "") + '" data-act="ntf" aria-expanded="' + S.ntfOpen + '">' +
      '<div class="ntf-top"><span class="app-ic ' + esc(c.format) + '">' + icon + '</span><span class="ntf-app">' + esc(f.app) + '</span><span class="ntf-tm">сейчас</span></div>' +
      '<div class="ntf-h">' + esc(c.format === "sms" ? f.sender : (c.format === "email" ? f.sender : c.subject || f.sender)) + "</div>" +
      (c.format === "email" && c.subject ? '<div class="ntf-h" style="font-weight:500">' + esc(c.subject) + "</div>" : "") +
      '<div class="ntf-tx">' + t(c.text) + "</div>" +
      (c.attachment && S.ntfOpen ? '<div class="ntf-att">' + ic("i-clip") + esc(c.attachment) + "</div>" : "") +
      "</button>" +
      '<div class="lock-hint">' + (S.ntfOpen ? "" : (c.format === "email" ? "Нажмите, чтобы открыть письмо" : "Нажмите, чтобы прочитать полностью")) + "</div>" +
      '<div class="lock-bar"></div></div>';
  }
  function renderMail(c, f) {
    var att = "";
    if (c.attachment) {
      var href = D.results.reportPdf;
      att = (href ? '<a class="mail-att" href="' + esc(href) + '" target="_blank" rel="noopener">' : '<div class="mail-att">') +
        '<span class="ic">' + ic("i-clip") + '</span><span><b>' + esc(c.attachment) + "</b><span>PDF</span></span>" + (href ? "</a>" : "</div>") +
        (href ? "" : '<div class="d pd-todo" style="font-size:11px;margin-top:8px">' + t(D.results.reportTodo) + "</div>");
    }
    return STATUSBAR + '<div class="mail-head"><button type="button" class="mail-back" data-act="mailback">' + ic("i-arrow-l") + 'Входящие</button></div>' +
      '<div class="body" style="padding-top:14px"><h2 class="h2s" style="font-size:18px;margin-bottom:12px">' + esc(c.subject || c.moment) + "</h2>" +
      '<div class="mail-from"><span class="mail-ava">' + ic("i-bq") + '</span><span><b>' + esc(f.sender) + "</b><span>сегодня, 9:41</span></span></div>" +
      '<div class="mail-body"><p>' + t(c.text) + "</p></div>" + att + '<div style="height:16px"></div></div>';
  }

  /* ---------- page ---------- */
  var track = document.getElementById("track");
  var stepsNav = document.getElementById("steps");
  var dd = document.getElementById("stepsDd");
  var mq = window.matchMedia("(min-width:1024px)");
  var stepEls = [], screenEls = [];

  document.getElementById("pageTitle").textContent = D.title;
  document.getElementById("pagePartners").textContent = D.partners;
  document.getElementById("pageSubtitle").textContent = D.subtitle;
  function setHint() { document.getElementById("pageHint").textContent = mq.matches ? D.hint : (D.hintMobile || D.hint); }
  setHint();
  document.getElementById("scrTotal").textContent = STEPS.length;

  var STAGE_COLOR = ["#1098D4", "#05131A", "#63BCE3", "#1098D4", "#27AE60", "#F5A623"];
  var lastStage = null, stageN = -1;
  STEPS.forEach(function (m, k) {
    if (m.stage !== lastStage) {
      stageN++;
      var g = document.createElement("div");
      g.className = "grp";
      g.innerHTML = '<span class="gd" style="background:' + STAGE_COLOR[stageN % STAGE_COLOR.length] + '"></span>' + esc(m.stage);
      stepsNav.appendChild(g);
      lastStage = m.stage;
    }
    var b = document.createElement("button");
    b.type = "button";
    b.className = "step" + (m.kind === "comm" ? " comm" : "");
    b.innerHTML = '<span class="n">' + (k + 1) + '</span><span class="stx">' +
      (m.kind === "comm" ? '<span class="msg">' + ic("i-msg") + "</span>" : "") + esc(m.title) +
      '<span class="fk">' + t(m.cap) + "</span></span>";
    b.addEventListener("click", function () { go(k); if (!mq.matches) dd.open = false; });
    stepsNav.appendChild(b);
    stepEls.push(b);

    var sc = document.createElement("div");
    sc.className = "screen";
    sc.setAttribute("aria-hidden", "true");
    track.appendChild(sc);
    screenEls.push(sc);
  });

  function renderScreen(k) {
    var st = STEPS[k];
    screenEls[k].innerHTML = st.kind === "comm" ? renderComm(st) : (R[st.id] ? R[st.id]() : "");
  }
  function renderAll() { for (var k = 0; k < STEPS.length; k++) renderScreen(k); }

  function chrome() {
    var st = STEPS[S.i];
    track.style.transform = "translateX(" + (-S.i * 100) + "%)";
    document.getElementById("scrNum").textContent = S.i + 1;
    document.getElementById("btnPrev").disabled = S.i === 0;
    document.getElementById("btnNext").disabled = S.i === STEPS.length - 1;
    var cap = '<span class="ct">' + esc(st.title) + "</span>" + t(st.cap);
    if (st.kind === "comm" && D.commsNote) cap += '<span class="cnote">' + t(D.commsNote) + "</span>";
    document.getElementById("caption").innerHTML = cap;
    document.getElementById("sumN").textContent = S.i + 1;
    document.getElementById("sumT").textContent = st.title;
    stepEls.forEach(function (el, k) {
      el.classList.toggle("active", k === S.i);
      el.classList.toggle("done", k < S.i);
      if (k === S.i) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current");
    });
    screenEls.forEach(function (el, k) {
      el.setAttribute("aria-hidden", k === S.i ? "false" : "true");
      if (k === S.i) el.removeAttribute("inert"); else el.setAttribute("inert", "");
    });
    var a = stepEls[S.i];
    if (a && mq.matches) { var nav = stepsNav; var top = a.offsetTop - nav.offsetTop; if (top < nav.scrollTop || top + a.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = top - 40; }
  }

  function go(n) {
    var target = Math.max(0, Math.min(STEPS.length - 1, n));
    var instant = Math.abs(target - S.i) > 1;
    var from = STEPS[S.i].id;
    S.i = target;
    S.ntfOpen = false;
    var id = STEPS[target].id;
    if (id !== "param") S.pdTab = 0;
    if (id === "quest" && from === "ordered") S.qPage = 0;
    renderAll();
    if (instant) { track.style.transition = "none"; chrome(); void track.offsetWidth; track.style.transition = ""; }
    else chrome();
    var body = screenEls[target].querySelector(".body"); if (body) body.scrollTop = 0;
  }
  function next() { if (S.i < STEPS.length - 1) go(S.i + 1); }
  function prev() { if (S.i > 0) go(S.i - 1); }
  function rerender() { renderScreen(S.i); }

  document.getElementById("btnPrev").addEventListener("click", prev);
  document.getElementById("btnNext").addEventListener("click", next);

  /* ---------- actions inside screens ---------- */
  track.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || !track.contains(el)) return;
    var a = el.getAttribute("data-act");
    switch (a) {
      case "next": if (!el.disabled) next(); break;
      case "go": go(idx(el.getAttribute("data-to"))); break;
      case "variant": S.variant = +el.getAttribute("data-v"); rerender(); break;
      case "promo":
        S.promoApplied = S.promo.trim() !== "";
        var pn = document.getElementById("promoNote"); if (pn) pn.outerHTML = promoNote();
        break;
      case "consent": var k = +el.getAttribute("data-k"); S.consents[k] = !S.consents[k]; rerender(); break;
      case "qopt": S.answers[el.getAttribute("data-key")] = +el.getAttribute("data-o"); rerender(); break;
      case "qnext":
        if (S.qPage < D.questionnaire.blocks.length - 1) { S.qPage++; rerender(); screenEls[S.i].querySelector(".body").scrollTop = 0; }
        else next();
        break;
      case "qback": S.qPage = Math.max(0, S.qPage - 1); rerender(); break;
      case "date": S.date = +el.getAttribute("data-k"); rerender(); break;
      case "slot": S.slot = +el.getAttribute("data-k"); rerender(); break;
      case "hide": S.hideNorm = !S.hideNorm; rerender(); break;
      case "param": S.param = +el.getAttribute("data-k"); S.paramFrom = STEPS[S.i].id; go(idx("param")); break;
      case "pclose": go(idx(S.paramFrom || "list")); break;
      case "pdtab": S.pdTab = +el.getAttribute("data-k"); rerender(); break;
      case "ntf": S.ntfOpen = true; rerender(); break;
      case "mailback": S.ntfOpen = false; rerender(); break;
    }
  });
  track.addEventListener("input", function (e) {
    var el = e.target;
    if (el.id === "promoInp") {
      S.promo = el.value;
      S.promoApplied = false;
      var pn = document.getElementById("promoNote"); if (pn) pn.outerHTML = promoNote();
    } else if (el.hasAttribute("data-key")) {
      S.answers[el.getAttribute("data-key")] = el.value;
    }
  });

  /* ---------- keyboard and swipe ---------- */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
    if (e.key === "Escape" && dd.open && !mq.matches) dd.open = false;
  });
  var tx = null, ty = 0;
  var phone = document.getElementById("phone");
  phone.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1 || /input|textarea/i.test(e.target.tagName)) { tx = null; return; }
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  phone.addEventListener("touchend", function (e) {
    if (tx == null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    tx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else prev(); }
  }, { passive: true });

  /* Список шагов: на десктопе всегда раскрыт, на мобильной выпадающий */
  function syncDd() { if (mq.matches) dd.open = true; else dd.open = false; setHint(); }
  (mq.addEventListener ? mq.addEventListener("change", syncDd) : mq.addListener(syncDd));
  syncDd();
  dd.querySelector("summary").addEventListener("click", function (e) { if (mq.matches) e.preventDefault(); });
  document.addEventListener("click", function (e) { if (!mq.matches && dd.open && !dd.contains(e.target)) dd.open = false; });

  /* ---------- results data ---------- */
  renderAll();
  chrome();
  fetch(D.results.dataJson).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { METS = (j.metabolites || []).filter(function (m) { return typeof m.z === "number"; }); renderAll(); })
    .catch(function () { METS_ERR = true; renderAll(); });
})();
