window.attachMarkdownToolbar = function attachMarkdownToolbar(toolbar, textarea) {
  if (!toolbar || !textarea || toolbar.dataset.ready === "1") return;
  toolbar.dataset.ready = "1";
  toolbar.classList.add("md-toolbar");

  const actions = [
    { label: "B", title: "Bold", wrap: ["**", "**"] },
    { label: "I", title: "Italic", wrap: ["*", "*"] },
    { label: "H", title: "Heading", prefix: "## " },
    { label: "“", title: "Quote", prefix: "> " },
    { label: "•", title: "List", prefix: "- " },
    { label: "1.", title: "Numbered list", prefix: "1. " },
    { label: "</>", title: "Code", wrap: ["`", "`"] },
    { label: "link", title: "Link", wrap: ["[", "](https://)"] }
  ];

  function apply(action) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || "text";
    let next;
    let cursor;
    if (action.wrap) {
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
  }

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-toolbar-btn";
    button.title = action.title;
    button.textContent = action.label;
    button.addEventListener("click", () => apply(action));
    toolbar.append(button);
  }
};
