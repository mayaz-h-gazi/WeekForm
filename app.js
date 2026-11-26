(function () {
  "use strict";

  const STORAGE_KEY = "weekform-semester-planner-v1";
  const DAYS = [
    { key: "sun", short: "Su", long: "Sunday" },
    { key: "mon", short: "M", long: "Monday" },
    { key: "tue", short: "Tu", long: "Tuesday" },
    { key: "wed", short: "W", long: "Wednesday" },
    { key: "thu", short: "Th", long: "Thursday" },
    { key: "fri", short: "F", long: "Friday" },
    { key: "sat", short: "Sa", long: "Saturday" }
  ];
  const TYPES = [
    { key: "lec", label: "Lecture", short: "Lec", css: "type-lec" },
    { key: "com", label: "Computer Lab", short: "Com", css: "type-com" },
    { key: "sci", label: "Science Lab", short: "Sci", css: "type-sci" },
    { key: "lan", label: "Language Lab", short: "Lan", css: "type-lan" },
    { key: "stu", label: "Studio", short: "Stu", css: "type-stu" },
    { key: "hsci", label: "Health Science", short: "H Sci", css: "type-hsci" }
  ];
  const HOUR_HEIGHT = 60;
  const app = {
    store: null,
    tab: "schedule",
    draft: null
  };

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  function makeSemester(name) {
    return { id: uid(), name: name, minCredits: 12, maxCredits: 15, courses: [] };
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && Array.isArray(saved.semesters) && saved.semesters.length) {
          const semesters = saved.semesters.map(function (semester) {
            const min = Number(semester.minCredits);
            const max = Number(semester.maxCredits);
            return {
              id: String(semester.id || uid()),
              name: String(semester.name || "My semester"),
              minCredits: Number.isFinite(min) && min >= 0 ? min : 12,
              maxCredits: Number.isFinite(max) && max > 0 ? max : 15,
              courses: Array.isArray(semester.courses) ? semester.courses : []
            };
          });
          return {
            currentId: semesters.some(function (semester) { return semester.id === saved.currentId; }) ? saved.currentId : semesters[0].id,
            semesters: semesters
          };
        }
      }
    } catch (error) {
      // A fresh plan is created if saved browser data is unavailable.
    }
    const first = makeSemester("My semester 1");
    return { currentId: first.id, semesters: [first] };
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app.store));
    } catch (error) {
      showGlobalMessage("This browser could not save your plan. Check its storage settings and keep a separate copy of your routine.");
    }
  }

  function currentSemester() {
    return app.store.semesters.find(function (semester) { return semester.id === app.store.currentId; }) || app.store.semesters[0];
  }

  function typeInfo(key) {
    return TYPES.find(function (type) { return type.key === key; }) || TYPES[0];
  }

  function totalCredits(semester) {
    return semester.courses.reduce(function (sum, course) {
      return sum + (Array.isArray(course.components) ? course.components.reduce(function (componentSum, component) {
        const value = Number(component.credits);
        return componentSum + (Number.isFinite(value) ? value : 0);
      }, 0) : 0);
    }, 0);
  }

  function allMeetings(semester) {
    const result = [];
    semester.courses.forEach(function (course) {
      (course.components || []).forEach(function (component) {
        (component.meetings || []).forEach(function (meeting) {
          if (meeting && Array.isArray(meeting.days) && meeting.days.length && meeting.start && meeting.end) {
            const start = toMinutes(meeting.start);
            const end = toMinutes(meeting.end);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
              result.push({
                courseId: course.id,
                courseName: course.name || "Untitled course",
                courseCode: course.code || "",
                componentId: component.id,
                componentType: component.type || "lec",
                meetingId: meeting.id,
                days: meeting.days,
                start: meeting.start,
                end: meeting.end
              });
            }
          }
        });
      });
    });
    return result;
  }

  function findConflicts(semester) {
    const meetings = allMeetings(semester);
    const conflicts = [];
    for (let i = 0; i < meetings.length; i += 1) {
      for (let j = i + 1; j < meetings.length; j += 1) {
        const first = meetings[i];
        const second = meetings[j];
        const sharedDays = DAYS.filter(function (day) {
          return first.days.indexOf(day.key) >= 0 && second.days.indexOf(day.key) >= 0;
        }).map(function (day) { return day.key; });
        if (!sharedDays.length) continue;
        if (toMinutes(first.start) < toMinutes(second.end) && toMinutes(first.end) > toMinutes(second.start)) {
          conflicts.push({ first: first, second: second, days: sharedDays });
        }
      }
    }
    return conflicts;
  }

  function conflictKey(courseId, meetingId) {
    return String(courseId) + "::" + String(meetingId);
  }

  function conflictMap(conflicts) {
    const map = new Set();
    conflicts.forEach(function (conflict) {
      map.add(conflictKey(conflict.first.courseId, conflict.first.meetingId));
      map.add(conflictKey(conflict.second.courseId, conflict.second.meetingId));
    });
    return map;
  }

  function toMinutes(value) {
    const parts = String(value || "").split(":");
    if (parts.length !== 2) return NaN;
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return NaN;
    return hour * 60 + minute;
  }

  function timeParts(value) {
    const minutes = toMinutes(value);
    if (!Number.isFinite(minutes)) return { hour: "", minute: "", period: "" };
    const hour24 = Math.floor(minutes / 60);
    return {
      hour: String(hour24 % 12 || 12).padStart(2, "0"),
      minute: String(minutes % 60).padStart(2, "0"),
      period: hour24 >= 12 ? "PM" : "AM"
    };
  }

  function timeFromParts(hourValue, minuteValue, periodValue) {
    if (!hourValue || !minuteValue || !periodValue) return "";
    let hour = Number(hourValue) % 12;
    if (periodValue === "PM") hour += 12;
    return String(hour).padStart(2, "0") + ":" + String(Number(minuteValue)).padStart(2, "0");
  }

  function selectorOptions(values, selectedValue, placeholder) {
    let options = '<option value="">' + placeholder + '</option>';
    values.forEach(function (value) {
      options += '<option value="' + value + '"' + (String(value) === String(selectedValue) ? " selected" : "") + '>' + value + '</option>';
    });
    return options;
  }

  function formatTime(value) {
    const minutes = toMinutes(value);
    if (!Number.isFinite(minutes)) return "";
    const hour = Math.floor(minutes / 60);
    const suffix = hour >= 12 ? "PM" : "AM";
    const shownHour = hour % 12 || 12;
    const minute = minutes % 60;
    return shownHour + (minute ? ":" + String(minute).padStart(2, "0") : "") + suffix;
  }

  function formatCredit(value) {
    const rounded = Math.round(Number(value) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function formatDays(keys) {
    return DAYS.filter(function (day) { return (keys || []).indexOf(day.key) >= 0; }).map(function (day) { return day.short; }).join(" · ");
  }

  function showGlobalMessage(message) {
    const box = $("#global-message");
    box.textContent = message;
    box.hidden = false;
  }

  function clearGlobalMessage() {
    const box = $("#global-message");
    box.textContent = "";
    box.hidden = true;
  }

  function renderSemesterPicker() {
    const select = $("#semester-select");
    select.innerHTML = app.store.semesters.map(function (semester) {
      return '<option value="' + escapeHtml(semester.id) + '">' + escapeHtml(semester.name) + "</option>";
    }).join("");
    select.value = app.store.currentId;
  }

  function renderSummary() {
    const semester = currentSemester();
    const credits = totalCredits(semester);
    const maximum = Number(semester.maxCredits) || 15;
    const minimum = Number(semester.minCredits) || 0;
    const count = semester.courses.length;
    const meetingCount = allMeetings(semester).length;
    $("#credit-total").textContent = formatCredit(credits);
    $("#credit-target").textContent = "Target: " + formatCredit(minimum) + "–" + formatCredit(maximum) + " credits";
    $("#meter-max").textContent = formatCredit(maximum) + " credits";
    const meter = $("#credit-meter");
    meter.style.width = Math.max(0, Math.min(100, maximum ? credits / maximum * 100 : 0)) + "%";
    const progress = $(".meter-track");
    progress.setAttribute("aria-valuemax", String(maximum));
    progress.setAttribute("aria-valuenow", String(credits));
    const status = $("#load-status");
    status.className = "load-status";
    if (credits < minimum) {
      status.textContent = "Add " + formatCredit(minimum - credits) + " more credits to reach your minimum.";
      status.classList.add("is-warning");
    } else if (credits > maximum) {
      status.textContent = "You are " + formatCredit(credits - maximum) + " credits above your limit.";
      status.classList.add("is-warning");
    } else {
      status.textContent = "Within your credit range.";
      status.classList.add("is-ready");
    }
    $("#course-count").textContent = String(count);
    $("#meeting-count").textContent = String(meetingCount);
    $("#course-tab-count").textContent = String(count);
    $("#semester-eyebrow").textContent = semester.name.toUpperCase();
  }

  function setActiveTab(tab) {
    app.tab = tab;
    $$(".tab-button").forEach(function (button) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    renderView();
  }

  function renderView() {
    if (app.tab === "schedule") renderSchedule();
    else if (app.tab === "courses") renderCourses();
    else renderGeneral();
  }

  function renderSchedule() {
    const semester = currentSemester();
    const conflicts = findConflicts(semester);
    const badMeetings = conflictMap(conflicts);
    const meetings = allMeetings(semester);
    const top = '<div class="view-heading"><div><h2>Your weekly rhythm</h2><p>Every saved meeting appears here. Scroll sideways to see the full week.</p></div>' +
      '<span class="week-caption"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.7"/><path d="M8 4.5V8l2.4 1.5"/></svg> Weekly view</span></div>';
    if (!semester.courses.length) {
      $("#view-content").innerHTML = top + '<div class="empty-state"><div class="empty-illustration"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M7.5 2.8v3M16.5 2.8v3M3.5 8.5h17M8 12h2M14 12h2M8 16h2"/></svg></div><h3>Your week is open.</h3><p>Add your first course, then build its credit components and meeting times one by one.</p><button class="button button-primary" type="button" data-add-course>Start with a course</button></div>';
      return;
    }
    const grid = buildCalendar(meetings, badMeetings);
    let conflictHtml = "";
    if (conflicts.length) {
      conflictHtml = '<section class="conflict-panel" aria-label="Timing conflicts"><h3><span class="conflict-badge">' + conflicts.length + '</span> Timing overlap' + (conflicts.length === 1 ? "" : "s") + ' to resolve</h3><ul class="conflict-list">' +
        conflicts.map(function (conflict) {
          const overlapStart = Math.max(toMinutes(conflict.first.start), toMinutes(conflict.second.start));
          const overlapEnd = Math.min(toMinutes(conflict.first.end), toMinutes(conflict.second.end));
          const sameCourse = conflict.first.courseId === conflict.second.courseId;
          const pairLabel = sameCourse
            ? "two meetings in " + escapeHtml(conflict.first.courseName)
            : escapeHtml(conflict.first.courseName) + " (" + escapeHtml(typeInfo(conflict.first.componentType).short) + ") and " + escapeHtml(conflict.second.courseName) + " (" + escapeHtml(typeInfo(conflict.second.componentType).short) + ")";
          return "<li><strong>" + escapeHtml(formatDays(conflict.days)) + " · " + escapeHtml(formatTime(String(Math.floor(overlapStart / 60)).padStart(2, "0") + ":" + String(overlapStart % 60).padStart(2, "0")) + "–" + formatTime(String(Math.floor(overlapEnd / 60)).padStart(2, "0") + ":" + String(overlapEnd % 60).padStart(2, "0"))) + "</strong> overlaps between " + pairLabel + ". Edit a meeting time to clear it.</li>";
        }).join("") + "</ul></section>";
    } else if (meetings.length) {
      conflictHtml = '<div class="no-conflict"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.2 3 3 6-6.5"/></svg> No overlapping class times</div>';
    }
    $("#view-content").innerHTML = top + grid + conflictHtml;
  }

  function buildCalendar(meetings, badMeetings) {
    if (!meetings.length) {
      return '<div class="empty-state schedule-empty"><div class="empty-illustration"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></div><h3>No meeting times added yet</h3><p>Choose the days, hour, minute, and AM/PM for each class. The week view will use the times you enter.</p></div>';
    }
    const earliest = Math.min.apply(null, meetings.map(function (meeting) { return toMinutes(meeting.start); }));
    const latest = Math.max.apply(null, meetings.map(function (meeting) { return toMinutes(meeting.end); }));
    const rangeStart = Math.floor(earliest / 60) * 60;
    const rangeEnd = Math.max(rangeStart + 60, Math.ceil(latest / 60) * 60);
    const hours = [];
    for (let minute = rangeStart; minute < rangeEnd; minute += 60) {
      hours.push({ minute: minute, label: formatTime(String(Math.floor(minute / 60)).padStart(2, "0") + ":00") });
    }
    const height = (rangeEnd - rangeStart) / 60 * HOUR_HEIGHT;
    const header = '<div class="calendar-header"><div><span class="timezone-label">TIME</span></div>' +
      DAYS.map(function (day) { return '<div><span class="day-name">' + day.long + '</span><span class="day-letter">' + day.short + '</span></div>'; }).join("") + '</div>';
    const timeLabels = hours.map(function (hour) {
      const top = (hour.minute - rangeStart) / 60 * HOUR_HEIGHT;
      return '<span class="time-label" style="top:' + top + 'px' + (top === 0 ? ';transform:translateY(0)' : '') + '">' + hour.label + '</span>';
    }).join("");
    const columns = DAYS.map(function (day) {
      const blocks = meetings.filter(function (meeting) { return meeting.days.indexOf(day.key) >= 0; }).map(function (meeting) {
        const start = toMinutes(meeting.start);
        const end = toMinutes(meeting.end);
        const duration = end - start;
        const top = (start - rangeStart) / 60 * HOUR_HEIGHT;
        const blockHeight = Math.max(2, duration / 60 * HOUR_HEIGHT - 2);
        const type = typeInfo(meeting.componentType);
        const title = meeting.courseCode ? meeting.courseCode + " · " + meeting.courseName : meeting.courseName;
        const isConflict = badMeetings.has(conflictKey(meeting.courseId, meeting.meetingId));
        return '<div class="class-event ' + type.css + (duration < 36 ? ' is-compact' : '') + (isConflict ? ' is-conflict' : '') + '" style="top:' + top + 'px;height:' + blockHeight + 'px" title="' +
          escapeHtml(title + " — " + type.label + " — " + formatTime(meeting.start) + "–" + formatTime(meeting.end)) + '">' +
          '<strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(type.short + " · " + formatTime(meeting.start) + "–" + formatTime(meeting.end)) + '</span></div>';
      }).join("");
      return '<div class="day-track" style="height:' + height + 'px" aria-label="' + day.long + '">' + blocks + '</div>';
    }).join("");
    const legend = TYPES.map(function (type) {
      return '<span class="legend-item"><span class="legend-swatch ' + type.css + '"></span>' + type.label + '</span>';
    }).join("");
    return '<div class="calendar-card"><div class="calendar-viewport"><div class="calendar">' + header +
      '<div class="calendar-body"><div class="time-rail" style="height:' + height + 'px">' + timeLabels + '</div>' + columns + '</div></div></div>' +
      '<div class="schedule-legend">' + legend + '</div></div>';
  }

  function renderCourses() {
    const semester = currentSemester();
    const conflicts = findConflicts(semester);
    const conflictMeetings = conflictMap(conflicts);
    const heading = '<div class="view-heading"><div><h2>Courses in this semester</h2><p>Add courses freely, then give each credit type its own weekly meeting pattern.</p></div>' +
      (semester.courses.length ? '<button class="small-button" type="button" data-add-course>＋ Add course</button>' : "") + '</div>';
    if (!semester.courses.length) {
      $("#view-content").innerHTML = heading + '<div class="empty-state"><div class="empty-illustration"><svg viewBox="0 0 24 24"><path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.8v4h4M8 12h8M8 16h5"/></svg></div><h3>No courses yet</h3><p>Create a course entry with any mix of lecture, lab, studio, or other credit components.</p><button class="button button-primary" type="button" data-add-course>Add your first course</button></div>';
      return;
    }
    const cards = semester.courses.map(function (course) {
      const components = course.components || [];
      const courseTotal = components.reduce(function (sum, component) { return sum + (Number(component.credits) || 0); }, 0);
      const courseHasConflict = components.some(function (component) {
        return (component.meetings || []).some(function (meeting) { return conflictMeetings.has(conflictKey(course.id, meeting.id)); });
      });
      const componentRows = components.map(function (component) {
        const type = typeInfo(component.type);
        const meetingLabels = (component.meetings || []).map(function (meeting) {
          return formatDays(meeting.days) + " · " + formatTime(meeting.start) + "–" + formatTime(meeting.end);
        });
        const schedule = meetingLabels.length ? meetingLabels.join("  /  ") : "No meeting time set";
        return '<div class="component-row"><span class="component-chip ' + type.css + '">' + type.label + " · " + escapeHtml(formatCredit(component.credits)) + ' cr</span>' +
          '<span class="component-schedule' + (meetingLabels.length ? "" : " empty") + '">' + escapeHtml(schedule) + '</span></div>';
      }).join("");
      return '<article class="course-card"><div class="course-card-head"><div><div class="course-title-row"><h3 class="course-title">' + escapeHtml(course.name || "Untitled course") + '</h3>' +
        (course.code ? '<span class="course-code">' + escapeHtml(course.code) + '</span>' : "") +
        '<span class="course-credit-total">' + escapeHtml(formatCredit(courseTotal)) + ' credits</span></div>' +
        (courseHasConflict ? '<p class="course-conflict-note">This course has an overlapping time</p>' : "") +
        '</div><div class="course-actions"><button class="text-action" type="button" data-edit-course="' + escapeHtml(course.id) + '">Edit</button><button class="text-action delete" type="button" data-delete-course="' + escapeHtml(course.id) + '">Remove</button></div></div>' +
        '<div class="component-list">' + componentRows + '</div></article>';
    }).join("");
    $("#view-content").innerHTML = heading + '<div class="course-list">' + cards + '</div>';
  }

  function renderGeneral() {
    const semester = currentSemester();
    const categoryRows = TYPES.map(function (type) {
      return '<div class="category-reference-row"><span>' + type.label + '</span><span class="category-short">' + type.short + '</span></div>';
    }).join("");
    $("#view-content").innerHTML =
      '<div class="view-heading"><div><h2>General settings</h2><p>Set a credit range that fits your department. Each semester keeps its own settings.</p></div></div>' +
      '<div class="settings-grid">' +
        '<section class="settings-card"><h2>Semester setup</h2><p>Personalize this routine and set the minimum and maximum credits for your program.</p>' +
          '<div class="settings-field"><label class="field-label" for="semester-name-setting">Semester name</label><input class="text-input" id="semester-name-setting" maxlength="60" value="' + escapeHtml(semester.name) + '"></div>' +
          '<div class="credit-range-fields">' +
            '<div><label class="field-label" for="min-credits-setting">Minimum credits</label><input class="number-input" type="number" id="min-credits-setting" min="0" step="0.5" value="' + escapeHtml(semester.minCredits) + '"></div>' +
            '<div><label class="field-label" for="max-credits-setting">Maximum credits</label><input class="number-input" type="number" id="max-credits-setting" min="0.5" step="0.5" value="' + escapeHtml(semester.maxCredits) + '"></div>' +
          '</div><div id="range-note" class="range-note" aria-live="polite">Your credit load is checked against this range.</div>' +
        '</section>' +
        '<section class="settings-card"><h2>Credit components</h2><p>Use one or more component types for each course. Every component can have its own credits and weekly meeting times.</p>' +
          '<div class="category-reference">' + categoryRows + '</div>' +
        '</section>' +
      '</div>' +
      '<div class="general-footer"><button class="danger-link" type="button" id="remove-semester-button">Remove this semester</button></div>';
    bindGeneralSettings();
  }

  function bindGeneralSettings() {
    const semesterName = $("#semester-name-setting");
    const minInput = $("#min-credits-setting");
    const maxInput = $("#max-credits-setting");
    const note = $("#range-note");
    semesterName.addEventListener("change", function () {
      const value = semesterName.value.trim();
      if (!value) {
        semesterName.value = currentSemester().name;
        return;
      }
      currentSemester().name = value;
      saveStore();
      renderSemesterPicker();
      renderSummary();
    });
    const updateRange = function () {
      const min = Number(minInput.value);
      const max = Number(maxInput.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
        note.textContent = "Enter a valid range. The maximum must be greater than the minimum.";
        note.classList.add("is-error");
        return;
      }
      note.textContent = "Saved for this semester. Your current load is " + formatCredit(totalCredits(currentSemester())) + " credits.";
      note.classList.remove("is-error");
      currentSemester().minCredits = min;
      currentSemester().maxCredits = max;
      saveStore();
      renderSummary();
    };
    minInput.addEventListener("change", updateRange);
    maxInput.addEventListener("change", updateRange);
    $("#remove-semester-button").addEventListener("click", removeCurrentSemester);
  }

  function meetingFormMarkup(component, index) {
    const type = typeInfo(component.type);
    const heading = '<div class="component-editor-head"><strong>Component ' + (index + 1) + ' · ' + type.label + '</strong>' +
      '<button class="meeting-remove" type="button" data-remove-component="' + escapeHtml(component.id) + '">Remove component</button></div>';
    const setup = '<div class="component-setup"><div><label class="field-label">Credit type</label><select class="select-input" data-component-field="type" data-component-id="' + escapeHtml(component.id) + '">' +
      TYPES.map(function (item) { return '<option value="' + item.key + '"' + (item.key === component.type ? " selected" : "") + '>' + item.label + ' / ' + item.short + '</option>'; }).join("") +
      '</select></div><div><label class="field-label">Credits</label><input class="number-input" type="number" min="0.5" step="0.5" value="' + escapeHtml(component.credits) + '" data-component-field="credits" data-component-id="' + escapeHtml(component.id) + '" aria-label="' + type.label + ' credits"></div></div>';
    let meetings = "";
    if ((component.meetings || []).length) {
      meetings = '<div class="meetings-editor">' + component.meetings.map(function (meeting, meetingIndex) {
        const dayControls = DAYS.map(function (day) {
          const checked = (meeting.days || []).indexOf(day.key) >= 0 ? " checked" : "";
          return '<label class="day-option" title="' + day.long + '"><input type="checkbox" data-meeting-field="day" data-day="' + day.key + '" data-component-id="' + escapeHtml(component.id) + '" data-meeting-id="' + escapeHtml(meeting.id) + '"' + checked + '><span>' + day.short + '</span></label>';
        }).join("");
        return '<div class="meeting-editor"><div class="meeting-editor-head"><span>Weekly meeting ' + (meetingIndex + 1) + '</span><button class="meeting-remove" type="button" data-remove-meeting="' + escapeHtml(meeting.id) + '" data-component-id="' + escapeHtml(component.id) + '">Remove</button></div>' +
          '<div class="meeting-details"><div class="meeting-days"><label class="field-label">Days</label><div class="day-options">' + dayControls + '</div></div>' +
          timePickerMarkup(meeting, component.id, "start", "Starts") +
          timePickerMarkup(meeting, component.id, "end", "Ends") +
          '</div></div>';
      }).join("") + '</div>';
    } else {
      meetings = '<div class="meetings-empty"><span>No meeting time yet. This component can also be credit-only.</span><button class="small-button" type="button" data-add-meeting="' + escapeHtml(component.id) + '">＋ Add meeting</button></div>';
    }
    let rows = "";
    if ((component.meetings || []).length) {
      rows = '<div class="component-editor-footer"><button class="add-meeting-text" type="button" data-add-meeting="' + escapeHtml(component.id) + '">＋ Add another meeting pattern</button></div>';
    }
    return '<section class="component-editor" data-editor-component="' + escapeHtml(component.id) + '">' + heading + setup + meetings + rows + '</section>';
  }

  function timePickerMarkup(meeting, componentId, field, label) {
    const parts = timeParts(meeting[field]);
    const meetingAttributes = 'data-meeting-field="' + field + '" data-component-id="' + escapeHtml(componentId) + '" data-meeting-id="' + escapeHtml(meeting.id) + '"';
    const hourValues = [];
    const minuteValues = [];
    for (let hour = 1; hour <= 12; hour += 1) hourValues.push(String(hour).padStart(2, "0"));
    for (let minute = 0; minute <= 59; minute += 1) minuteValues.push(String(minute).padStart(2, "0"));
    return '<div class="meeting-time"><label class="field-label">' + label + '</label><div class="time-picker" role="group" aria-label="' + label + ' time">' +
      '<select class="meeting-select" data-time-part="hour" ' + meetingAttributes + ' aria-label="' + label + ' hour">' + selectorOptions(hourValues, parts.hour, "Hour") + '</select>' +
      '<select class="meeting-select" data-time-part="minute" ' + meetingAttributes + ' aria-label="' + label + ' minute">' + selectorOptions(minuteValues, parts.minute, "Min") + '</select>' +
      '<select class="meeting-select" data-time-part="period" ' + meetingAttributes + ' aria-label="' + label + ' AM or PM">' + selectorOptions(["AM", "PM"], parts.period, "AM/PM") + '</select>' +
      '</div></div>';
  }

  function renderCourseForm() {
    const draft = app.draft;
    $("#course-dialog-title").textContent = draft.id ? "Edit course" : "Add a course";
    const top = '<div class="form-top-grid"><div><label class="field-label" for="course-name">Course name</label><input class="text-input" id="course-name" maxlength="90" placeholder="Enter a course name" value="' + escapeHtml(draft.name) + '" required data-course-field="name"></div>' +
      '<div><label class="field-label" for="course-code">Course code <span class="category-short">optional</span></label><input class="text-input" id="course-code" maxlength="24" placeholder="e.g. BIO 210" value="' + escapeHtml(draft.code) + '" data-course-field="code"></div></div>';
    const components = '<section class="course-form-section"><div class="section-heading"><div><h3>Credit components</h3><p>Each component has its own schedule. Choose any hour, minute, and AM/PM value.</p></div><button class="small-button" type="button" id="add-component-button">＋ Add component</button></div>' +
      '<div class="components-editor">' + draft.components.map(meetingFormMarkup).join("") + '</div></section>';
    $("#course-form-content").innerHTML = top + components;
    $("#add-component-button").addEventListener("click", function () {
      draft.components.push({ id: uid(), type: "lec", credits: 1, meetings: [] });
      renderCourseForm();
      refreshDraftStatus();
    });
    $$("[data-remove-component]").forEach(function (button) {
      button.addEventListener("click", function () {
        draft.components = draft.components.filter(function (component) { return component.id !== button.dataset.removeComponent; });
        renderCourseForm();
        refreshDraftStatus();
      });
    });
    $$("[data-add-meeting]").forEach(function (button) {
      button.addEventListener("click", function () {
        const component = draft.components.find(function (item) { return item.id === button.dataset.addMeeting; });
        if (component) component.meetings.push({ id: uid(), days: [], start: "", end: "" });
        renderCourseForm();
        refreshDraftStatus();
      });
    });
    $$("[data-remove-meeting]").forEach(function (button) {
      button.addEventListener("click", function () {
        const component = draft.components.find(function (item) { return item.id === button.dataset.componentId; });
        if (component) component.meetings = component.meetings.filter(function (meeting) { return meeting.id !== button.dataset.removeMeeting; });
        renderCourseForm();
        refreshDraftStatus();
      });
    });
    $("#course-form-content").addEventListener("input", updateDraftField);
    $("#course-form-content").addEventListener("change", updateDraftField);
    refreshDraftStatus();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function updateDraftField(event) {
    const element = event.target;
    const draft = app.draft;
    if (element.dataset.courseField) {
      draft[element.dataset.courseField] = element.value;
    } else if (element.dataset.componentField) {
      const component = draft.components.find(function (item) { return item.id === element.dataset.componentId; });
      if (component) {
        const field = element.dataset.componentField;
        component[field] = field === "credits" ? Number(element.value) : element.value;
        if (field === "type") {
          const index = draft.components.indexOf(component);
          const header = $('[data-editor-component="' + cssEscape(component.id) + '"] .component-editor-head strong');
          const creditInput = $('[data-editor-component="' + cssEscape(component.id) + '"] input[data-component-field="credits"]');
          if (header) header.textContent = "Component " + (index + 1) + " · " + typeInfo(component.type).label;
          if (creditInput) creditInput.setAttribute("aria-label", typeInfo(component.type).label + " credits");
        }
      }
    } else if (element.dataset.meetingField) {
      const component = draft.components.find(function (item) { return item.id === element.dataset.componentId; });
      const meeting = component && component.meetings.find(function (item) { return item.id === element.dataset.meetingId; });
      if (meeting) {
        const field = element.dataset.meetingField;
        if (field === "day") {
          if (element.checked && meeting.days.indexOf(element.dataset.day) < 0) meeting.days.push(element.dataset.day);
          if (!element.checked) meeting.days = meeting.days.filter(function (day) { return day !== element.dataset.day; });
        } else {
          const picker = element.closest(".time-picker");
          const hour = picker && $('[data-time-part="hour"]', picker).value;
          const minute = picker && $('[data-time-part="minute"]', picker).value;
          const period = picker && $('[data-time-part="period"]', picker).value;
          meeting[field] = timeFromParts(hour, minute, period);
        }
      }
    }
    refreshDraftStatus();
  }

  function validateDraft(draft) {
    const errors = [];
    if (!String(draft.name || "").trim()) errors.push("Add a course name.");
    if (!draft.components.length) errors.push("Add at least one credit component.");
    draft.components.forEach(function (component, index) {
      const credits = Number(component.credits);
      if (!Number.isFinite(credits) || credits < 0.5) errors.push("Component " + (index + 1) + " needs at least 0.5 credits.");
      (component.meetings || []).forEach(function (meeting, meetingIndex) {
        if (!meeting.days.length || !meeting.start || !meeting.end) {
          errors.push("Finish the days and times for component " + (index + 1) + ", meeting " + (meetingIndex + 1) + ".");
        } else if (toMinutes(meeting.end) <= toMinutes(meeting.start)) {
          errors.push("A meeting end time must be later than its start time.");
        }
      });
    });
    const semester = currentSemester();
    const candidate = {
      id: draft.id || "__draft__",
      name: String(draft.name || "").trim() || "Untitled course",
      code: draft.code,
      components: draft.components
    };
    const allCourses = semester.courses.filter(function (course) { return course.id !== draft.id; }).concat([candidate]);
    const testSemester = { courses: allCourses };
    const conflicts = findConflicts(testSemester);
    conflicts.forEach(function (conflict) {
      if (conflict.first.courseId === candidate.id || conflict.second.courseId === candidate.id) {
        const sameCourse = conflict.first.courseId === candidate.id && conflict.second.courseId === candidate.id;
        const other = sameCourse ? "another meeting in this course" : (conflict.first.courseId === candidate.id ? conflict.second.courseName : conflict.first.courseName);
        errors.push("This meeting overlaps " + other + " on " + formatDays(conflict.days) + ".");
      }
    });
    return { errors: errors, conflicts: conflicts };
  }

  function refreshDraftStatus() {
    if (!app.draft) return;
    const result = validateDraft(app.draft);
    const status = $("#draft-status");
    const unique = Array.from(new Set(result.errors));
    if (unique.length) {
      status.textContent = unique.join(" ");
      status.className = "draft-status is-error";
    } else {
      status.textContent = "No timing overlaps found. This course is ready to save.";
      status.className = "draft-status is-success";
    }
    $("#save-course-button").disabled = unique.length > 0;
  }

  function openCourseDialog(courseId) {
    const semester = currentSemester();
    const course = courseId ? semester.courses.find(function (item) { return item.id === courseId; }) : null;
    app.draft = course ? JSON.parse(JSON.stringify(course)) : {
      id: null,
      name: "",
      code: "",
      components: [{ id: uid(), type: "lec", credits: 3, meetings: [] }]
    };
    clearGlobalMessage();
    renderCourseForm();
    $("#course-dialog").showModal();
    $("#course-name").focus();
  }

  function closeCourseDialog() {
    $("#course-dialog").close();
    app.draft = null;
  }

  function saveDraft(event) {
    event.preventDefault();
    if (!app.draft) return;
    const result = validateDraft(app.draft);
    if (result.errors.length) {
      refreshDraftStatus();
      return;
    }
    const semester = currentSemester();
    const savedCourse = {
      id: app.draft.id || uid(),
      name: String(app.draft.name).trim(),
      code: String(app.draft.code || "").trim(),
      components: app.draft.components.map(function (component) {
        return {
          id: component.id || uid(),
          type: typeInfo(component.type).key,
          credits: Number(component.credits),
          meetings: (component.meetings || []).map(function (meeting) {
            return { id: meeting.id || uid(), days: DAYS.filter(function (day) { return meeting.days.indexOf(day.key) >= 0; }).map(function (day) { return day.key; }), start: meeting.start, end: meeting.end };
          })
        };
      })
    };
    const index = semester.courses.findIndex(function (course) { return course.id === savedCourse.id; });
    if (index >= 0) semester.courses[index] = savedCourse;
    else semester.courses.push(savedCourse);
    saveStore();
    closeCourseDialog();
    renderAll();
  }

  function removeCourse(courseId) {
    const semester = currentSemester();
    const course = semester.courses.find(function (item) { return item.id === courseId; });
    if (!course) return;
    if (!window.confirm('Remove "' + course.name + '" from this semester?')) return;
    semester.courses = semester.courses.filter(function (item) { return item.id !== courseId; });
    saveStore();
    renderAll();
  }

  function removeCurrentSemester() {
    const semester = currentSemester();
    if (!window.confirm('Remove "' + semester.name + '" and all of its courses?')) return;
    if (app.store.semesters.length === 1) {
      const replacement = makeSemester("My semester 1");
      app.store.semesters = [replacement];
      app.store.currentId = replacement.id;
    } else {
      app.store.semesters = app.store.semesters.filter(function (item) { return item.id !== semester.id; });
      app.store.currentId = app.store.semesters[0].id;
    }
    saveStore();
    renderAll();
  }

  function renderAll() {
    renderSemesterPicker();
    renderSummary();
    renderView();
  }

  function openSemesterDialog() {
    $("#new-semester-name").value = "";
    $("#semester-dialog").showModal();
    $("#new-semester-name").focus();
  }

  function createSemester(event) {
    event.preventDefault();
    const input = $("#new-semester-name");
    const name = input.value.trim();
    if (!name) return;
    const semester = makeSemester(name);
    app.store.semesters.push(semester);
    app.store.currentId = semester.id;
    saveStore();
    $("#semester-dialog").close();
    setActiveTab("schedule");
    renderAll();
  }

  function bindEvents() {
    $("#semester-select").addEventListener("change", function (event) {
      app.store.currentId = event.target.value;
      clearGlobalMessage();
      saveStore();
      renderAll();
    });
    $("#new-semester-button").addEventListener("click", openSemesterDialog);
    $("#add-course-button").addEventListener("click", function () { openCourseDialog(null); });
    $("#course-form").addEventListener("submit", saveDraft);
    $("#semester-form").addEventListener("submit", createSemester);
    $$(".tab-button").forEach(function (button) {
      button.addEventListener("click", function () { setActiveTab(button.dataset.tab); });
    });
    document.body.addEventListener("click", function (event) {
      const addButton = event.target.closest("[data-add-course]");
      const editButton = event.target.closest("[data-edit-course]");
      const deleteButton = event.target.closest("[data-delete-course]");
      const closeButton = event.target.closest("[data-close-dialog]");
      const closeSemester = event.target.closest("[data-close-semester]");
      if (addButton) openCourseDialog(null);
      if (editButton) openCourseDialog(editButton.dataset.editCourse);
      if (deleteButton) removeCourse(deleteButton.dataset.deleteCourse);
      if (closeButton) closeCourseDialog();
      if (closeSemester) $("#semester-dialog").close();
    });
    $("#course-dialog").addEventListener("click", function (event) {
      if (event.target === $("#course-dialog")) closeCourseDialog();
    });
    $("#semester-dialog").addEventListener("click", function (event) {
      if (event.target === $("#semester-dialog")) $("#semester-dialog").close();
    });
  }

  app.store = readStore();
  bindEvents();
  renderAll();
}());

