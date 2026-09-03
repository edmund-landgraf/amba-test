import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function BackupGrid({ rows, token, onChange }) {
  const columnDefs = useMemo(() => [
    { field: "name", headerName: "File name", flex: 2, minWidth: 220 },
    {
      field: "exportedAt",
      headerName: "Created",
      flex: 1,
      minWidth: 160,
      valueFormatter: (p) => formatWhen(p.value)
    },
    {
      field: "bytes",
      headerName: "Size",
      width: 100,
      valueFormatter: (p) => formatBytes(p.value)
    },
    {
      headerName: "",
      field: "name",
      colId: "restore",
      width: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button secondary";
        button.textContent = "Restore";
        button.addEventListener("click", async () => {
          const ok = await (window.askAmbaConfirm
            ? window.askAmbaConfirm(`Overwrite all live AMBA Test data with ${params.value}?`)
            : Promise.resolve(confirm(`Overwrite all live AMBA Test data with ${params.value}?`)));
          if (!ok) return;
          await fetch("/api/admin/backups/restore", {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ name: params.value })
          });
          onChange?.();
        });
        return button;
      }
    },
    {
      headerName: "",
      field: "name",
      colId: "download",
      width: 120,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button secondary";
        button.textContent = "Download";
        button.addEventListener("click", async () => {
          const response = await fetch(`/api/admin/backups/file?name=${encodeURIComponent(params.value)}`, {
            headers: { authorization: `Bearer ${token}` }
          });
          const blob = await response.blob();
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = params.value;
          document.body.append(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
        return button;
      }
    },
    {
      headerName: "",
      field: "name",
      colId: "delete",
      width: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button danger";
        button.textContent = "Delete";
        button.addEventListener("click", async () => {
          if (!confirm(`Delete ${params.value}?`)) return;
          await fetch(`/api/admin/backups/file?name=${encodeURIComponent(params.value)}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` }
          });
          onChange?.();
        });
        return button;
      }
    }
  ], [token, onChange]);

  return (
    <AgGridReact
      theme="legacy"
      rowData={rows || []}
      columnDefs={columnDefs}
      overlayNoRowsTemplate="No backups yet."
      suppressCellFocus
      headerHeight={48}
      rowHeight={48}
    />
  );
}

const roots = new WeakMap();

window.mountAmbaBackupGrid = function mountAmbaBackupGrid(el, props) {
  if (!el) return;
  ModuleRegistry.registerModules([AllCommunityModule]);
  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(<BackupGrid {...props} />);
};
