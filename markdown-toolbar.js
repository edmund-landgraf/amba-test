window.renderMarkdown = function renderMarkdown(source) {
  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const lines = escapeHtml(source).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let list = null;

  function closeList() {
    if (list) {
      out.push(list === "ul" ? "</ul>" : "</ol>");
      list = null;
    }
  }

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push("<hr>");
      continue;
    }
    if (/^>\s+/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^>\s+/, ""))}</blockquote>`);
      continue;
    }
    const check = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (check) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${check[1].trim() ? "☑ " : "☐ "}${inline(check[2])}</li>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(unordered[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n") || "<p></p>";
};

window.htmlToMarkdown = function htmlToMarkdown(root) {
  if (!root) return "";

  function inline(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const inner = Array.from(node.childNodes).map(inline).join("");
    if (tag === "br") return "\n";
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "em" || tag === "i") return `*${inner}*`;
    if (tag === "del" || tag === "s" || tag === "strike") return `~~${inner}~~`;
    if (tag === "code") return `\`${inner}\``;
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      return `[${inner}](${href})`;
    }
    return inner;
  }

  function listItemMarkdown(li, ordered, index) {
    const text = Array.from(li.childNodes).map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && /^(ul|ol)$/i.test(child.tagName)) return "";
      return inline(child);
    }).join("").trim();
    const task = text.match(/^[☐☑]\s*(.*)$/);
    if (task) return `- [${text.startsWith("☑") ? "x" : " "}] ${task[1]}`;
    if (ordered) return `${index}. ${text}`;
    return `- ${text}`;
  }

  function blocks(parent) {
    const lines = [];
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) lines.push(text);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === "h1" || tag === "h2" || tag === "h3") {
        lines.push(`${"#".repeat(Number(tag[1]))} ${inline(node).trim()}`);
        continue;
      }
      if (tag === "hr") {
        lines.push("---");
        continue;
      }
      if (tag === "blockquote") {
        const quote = (node.textContent || "").trim().split("\n").map((line) => `> ${line.trim()}`).join("\n");
        if (quote) lines.push(quote);
        continue;
      }
      if (tag === "ul" || tag === "ol") {
        let i = 1;
        for (const li of node.children) {
          if (li.tagName.toLowerCase() !== "li") continue;
          lines.push(listItemMarkdown(li, tag === "ol", i));
          i += 1;
        }
        continue;
      }
      if (tag === "pre") {
        lines.push("```");
        lines.push((node.textContent || "").replace(/\n$/, ""));
        lines.push("```");
        continue;
      }
      if (tag === "p" || tag === "div") {
        const text = inline(node).trim();
        if (text) lines.push(text);
        continue;
      }
      const nested = blocks(node);
      if (nested) lines.push(nested);
    }
    return lines.join("\n\n");
  }

  return blocks(root).trim();
};

window.markdownToolbarActions = [
  { label: "B", title: "Bold", wrap: ["**", "**"], command: "bold" },
  { label: "I", title: "Italic", wrap: ["*", "*"], command: "italic" },
  { label: "S", title: "Strikethrough", wrap: ["~~", "~~"], command: "strikeThrough" },
  { label: "—", title: "Horizontal rule", insert: "\n\n---\n\n", command: "insertHorizontalRule" },
  { label: "H", title: "Heading", prefix: "## ", formatBlock: "h2" },
  { label: "“", title: "Quote", prefix: "> ", formatBlock: "blockquote" },
  { label: "•", title: "List", prefix: "- ", command: "insertUnorderedList" },
  { label: "1.", title: "Numbered list", prefix: "1. ", command: "insertOrderedList" },
  { label: "☐", title: "Task list", prefix: "- [ ] ", visual: "task" },
  { label: "`", title: "Code", wrap: ["`", "`"], visual: "code" },
  { label: "```", title: "Code block", wrap: ["```\n", "\n```"], formatBlock: "pre" },
  { label: "link", title: "Link", wrap: ["[", "](https://)"], visual: "link" }
];

window.applyMarkdownToolbarAction = function applyMarkdownToolbarAction(textarea, action) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end) || "text";
  let next;
  let cursor;
  if (action.insert) {
    next = value.slice(0, start) + action.insert + value.slice(end);
    cursor = start + action.insert.length;
  } else if (action.wrap) {
    next = value.slice(0, start) + action.wrap[0] + selected + action.wrap[1] + value.slice(end);
    cursor = start + action.wrap[0].length + selected.length + action.wrap[1].length;
  } else {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    next = value.slice(0, lineStart) + action.prefix + value.slice(lineStart);
    cursor = end + action.prefix.length;
  }
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

window.applyVisualToolbarAction = function applyVisualToolbarAction(live, action) {
  live.focus();
  if (action.command) {
    document.execCommand(action.command, false);
  } else if (action.formatBlock) {
    document.execCommand("formatBlock", false, action.formatBlock);
  } else if (action.visual === "task") {
    document.execCommand("insertUnorderedList", false);
    const node = window.getSelection()?.anchorNode;
    const li = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.("li");
    if (li && !/^[☐☑]/.test(li.textContent.trim())) {
      li.insertBefore(document.createTextNode("☐ "), li.firstChild);
    }
  } else if (action.visual === "code") {
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      const code = document.createElement("code");
      code.textContent = range.toString() || "code";
      range.deleteContents();
      range.insertNode(code);
    }
  } else if (action.visual === "link") {
    document.execCommand("createLink", false, "https://");
  }
  live.dispatchEvent(new Event("input", { bubbles: true }));
};

window.attachMarkdownToolbar = function attachMarkdownToolbar(toolbar, target) {
  if (!toolbar || !target || toolbar.dataset.ready === "1") return;
  toolbar.dataset.ready = "1";
  toolbar.classList.add("md-toolbar");
  const visual = target.isContentEditable;

  for (const action of window.markdownToolbarActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-toolbar-btn";
    button.title = action.title;
    button.textContent = action.label;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (visual) window.applyVisualToolbarAction(target, action);
      else window.applyMarkdownToolbarAction(target, action);
    });
    toolbar.append(button);
  }
};

window.attachMarkdownPopout = function attachMarkdownPopout(button, textarea) {
  if (!button || !textarea || button.dataset.popoutReady === "1") return;
  button.dataset.popoutReady = "1";

  let overlay = document.getElementById("markdownPopout");
  if (!overlay) {
    overlay = document.createElement("dialog");
    overlay.id = "markdownPopout";
    overlay.className = "markdown-popout-dialog";
    overlay.setAttribute("aria-labelledby", "markdownPopoutTitle");
    overlay.innerHTML = `
      <h2 id="markdownPopoutTitle" class="markdown-popout-title">Markdown editor</h2>
      <p class="markdown-popout-intro">Edit the live view. Markdown is generated on the right. Save writes that markdown to the content field.</p>
      <div class="markdown-visual-editor">
        <div class="md-editor markdown-popout-editor">
          <div class="md-toolbar" id="markdownPopoutToolbar"></div>
          <div class="markdown-popout-split">
            <div class="player-hook-md markdown-popout-live" id="markdownPopoutLive" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Live view"></div>
            <textarea class="markdown-popout-preview" id="markdownPopoutPreview" rows="18" readonly spellcheck="false" aria-label="Generated markdown"></textarea>
          </div>
        </div>
      </div>
      <p class="form-actions markdown-popout-actions">
        <button type="button" class="button secondary" id="markdownPopoutCancel">Close</button>
        <button type="button" class="button primary" id="markdownPopoutSave">Save</button>
      </p>
    `;
    document.body.append(overlay);
    const live = overlay.querySelector("#markdownPopoutLive");
    const preview = overlay.querySelector("#markdownPopoutPreview");
    window.attachMarkdownToolbar(overlay.querySelector("#markdownPopoutToolbar"), live);
    live.addEventListener("input", () => {
      preview.value = window.htmlToMarkdown(live);
    });
    overlay.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
  }

  const live = overlay.querySelector("#markdownPopoutLive");
  const preview = overlay.querySelector("#markdownPopoutPreview");
  const save = overlay.querySelector("#markdownPopoutSave");
  const cancel = overlay.querySelector("#markdownPopoutCancel");
  let target = textarea;

  function syncPreview() {
    preview.value = window.htmlToMarkdown(live);
  }

  function close() {
    if (overlay.open) overlay.close();
    target?.focus();
  }

  cancel.onclick = () => close();
  save.onclick = () => {
    target.value = preview.value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    target = textarea;
    live.innerHTML = window.renderMarkdown(textarea.value);
    syncPreview();
    if (!overlay.open) overlay.showModal();
    live.focus();
  });
};
