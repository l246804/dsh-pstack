/** Stylesheet for the pstack client dialog and its pages. */

const CSS = `
.pstack-config-modal {
  gap: 0;
  width: min(800px, 100%);
  max-width: calc(100vw - 48px);
  height: min(800px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px))));
}
.pstack-config-content {
  flex: 1;
  min-height: 0;
}
.pstack-config-content > div:first-child {
  padding-bottom: 0;
}
.pstack-config-content > div:last-child {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 8px;
  padding: 0;
}
.pstack-status {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 28px;
}
.pstack-status-compact {
  height: 20px;
  padding: 0 6px;
  font-size: 11px;
  line-height: 16px;
}
.pstack-tabs-row {
  padding: 0 24px 8px;
}
.pstack-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.pstack-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.pstack-section-head > div:first-child {
  flex: 1;
  min-width: 0;
}
.pstack-section-desc {
  margin: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pstack-section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
}
.pstack-icon-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.pstack-icon-btn-plain {
  border-color: transparent;
}
.pstack-icon-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.pstack-icon-btn:disabled {
  cursor: default;
  opacity: 0.4;
}
.pstack-icon-btn-danger {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.pstack-icon-btn-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}
.pstack-icon-btn:focus-visible {
  outline: var(--dsw-focus-ring-width) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.pstack-plugin-groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.pstack-plugin-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pstack-plugin-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}
.pstack-plugin-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.pstack-plugin-list,
.pstack-role-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pstack-plugin-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.pstack-plugin-icon {
  display: grid;
  place-items: center;
  align-self: center;
  flex: none;
  width: 40px;
  height: 40px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
}
.pstack-plugin-icon > svg {
  display: block;
  margin: auto;
}
.pstack-plugin-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pstack-plugin-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pstack-plugin-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.pstack-plugin-desc {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.pstack-plugin-id {
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.pstack-plugin-end {
  display: flex;
  align-items: center;
  flex: none;
  gap: 8px;
  padding-top: 2px;
}
.pstack-role-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill);
}
.pstack-role-card[data-dirty="true"] {
  border-color: color-mix(
    in srgb,
    var(--dsw-alias-state-warn-primary) 32%,
    var(--dsw-alias-settings-card-stroke)
  );
}
.pstack-budget-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(780px, 100%);
  max-width: calc(100vw - 48px);
  height: min(700px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px))));
  overflow: hidden;
}
.pstack-budget-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.pstack-budget-content > div:last-child {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 20px;
  padding: 0 24px;
  overflow: hidden;
}
.pstack-budget-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.pstack-budget-top {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 8px;
}
.pstack-budget-top .pstack-budget-form {
  flex: 1;
}
.pstack-budget-apply {
  flex: none;
  margin-top: 20px;
}
.pstack-budget-apply button {
  height: 32px;
}
.pstack-budget-scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}
.pstack-budget-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-module-platform);
}
.pstack-budget-status {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-effort-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 0.5px solid
    color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, var(--dsw-alias-settings-card-stroke));
  border-radius: var(--dsw-radius-lg);
  background: color-mix(
    in srgb,
    var(--dsw-alias-state-warn-primary) 14%,
    var(--dsw-alias-bg-layer-1)
  );
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-effort-hint > svg {
  flex: none;
  margin-top: 1px;
  color: var(--dsw-alias-state-warn-primary);
}
.pstack-budget-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.pstack-budget-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pstack-budget-preview-title {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}
.pstack-budget-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pstack-budget-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.pstack-budget-card[data-status="needs-choice"],
.pstack-budget-card[data-status="custom"] {
  border-color: color-mix(
    in srgb,
    var(--dsw-alias-state-error-primary) 28%,
    var(--dsw-alias-settings-card-stroke)
  );
}
.pstack-budget-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.pstack-budget-role {
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
.pstack-budget-route-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
  gap: 12px;
}
.pstack-budget-route-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.pstack-budget-route-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.pstack-budget-route-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
.pstack-budget-route-chip {
  display: inline-block;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.pstack-role-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.pstack-role-glyph {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.pstack-role-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pstack-role-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.pstack-role-name {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.pstack-code-chip {
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 16px;
  padding: 1px 6px;
}
.pstack-role-desc {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-role-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  padding-top: 4px;
}
.pstack-route-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pstack-route-row {
  display: grid;
  gap: 8px;
  align-items: end;
  padding: 10px 10px 10px 12px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-module-platform);
}
.pstack-route-actions {
  display: flex;
  align-items: center;
  align-self: end;
  gap: 6px;
}
.pstack-route-actions .pstack-icon-btn {
  width: 32px;
  height: 32px;
}
.pstack-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.pstack-field-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
/* Native select: DSH primitives ship no Select control, so this styles the platform control instead of rebuilding one. */
.pstack-select {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 30px 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  appearance: none;
  background-color: var(--dsw-alias-bg-layer-1);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 12px 12px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.pstack-select:focus {
  border-color: var(--dsw-alias-state-business-primary);
  outline: none;
}
.pstack-select:disabled {
  cursor: default;
  opacity: 0.6;
}
.pstack-role-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pstack-role-foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.pstack-role-save {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.pstack-inline-message {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-inline-message[data-tone="success"] {
  color: var(--dsw-alias-state-success-primary);
}
.pstack-inline-message[data-tone="warn"] {
  color: var(--dsw-alias-state-warn-primary);
}
.pstack-inline-message[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.pstack-file-meta {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  white-space: nowrap;
  gap: 8px;
  margin-top: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
}
.pstack-file-meta > span {
  flex: none;
}
.pstack-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-notice > svg {
  flex: none;
  margin-top: 1px;
  color: var(--dsw-alias-state-warn-primary);
}
.pstack-notice[data-tone="error"] {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}
.pstack-notice[data-tone="error"] > svg {
  color: var(--dsw-alias-state-error-primary);
}
.pstack-notice-list {
  margin: 0;
  padding: 0 0 0 16px;
}
.pstack-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 120px;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
@media (width <= 600px) {
  .pstack-config-modal,
  .pstack-budget-panel {
    width: 100%;
    max-width: none;
    height: 100%;
    border-radius: 0;
  }
  .pstack-tabs-row {
    padding: 6px 16px 0;
  }
  .pstack-body {
    padding: 14px 16px 20px;
  }
  .pstack-section-head,
  .pstack-role-head {
    flex-wrap: wrap;
  }
  .pstack-section-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .pstack-plugin-card {
    gap: 10px;
    padding: 12px;
  }
  .pstack-plugin-icon {
    display: none;
  }
  .pstack-route-row {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .pstack-role-foot {
    flex-wrap: wrap;
  }
  .pstack-role-save {
    width: 100%;
    justify-content: flex-end;
  }
  .pstack-budget-bar {
    align-items: flex-start;
    flex-direction: column;
  }
  .pstack-budget-form {
    grid-template-columns: minmax(0, 1fr);
  }
  .pstack-budget-route-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.pstack-setting-list {
  display: flex;
  flex-direction: column;
}
.pstack-setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l4);
}
.pstack-setting-item:first-child {
  padding-top: 0;
}
.pstack-setting-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.pstack-setting-copy {
  flex: 1;
  min-width: 0;
}
.pstack-setting-title {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.pstack-setting-description {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.pstack-setting-control {
  display: flex;
  flex: none;
  align-items: center;
  padding-top: 0;
}
.pstack-maintenance-panel {
  gap: 0;
  width: min(760px, 100%);
  max-width: calc(100vw - 48px);
  height: min(700px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px))));
}
.pstack-maintenance-content {
  flex: 1;
  min-height: 0;
}
.pstack-maintenance-content > div:last-child {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 16px;
  padding: 0 24px 24px;
  overflow: hidden;
}
.pstack-maintenance-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.pstack-maintenance-toolbar {
  display: flex;
  flex: none;
  justify-content: flex-end;
  padding-bottom: 8px;
}
.pstack-maintenance-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.pstack-maintenance-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.pstack-maintenance-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pstack-maintenance-group-title {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.pstack-maintenance-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pstack-maintenance-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-settings-card-fill);
}
.pstack-maintenance-copy {
  flex: 1;
  min-width: 0;
}
.pstack-maintenance-title {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pstack-maintenance-meta {
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-maintenance-foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
}
`;

let installed = false;

/** Insert the pstack stylesheet once per document. */
export function ensurePstackStyles(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  if (document.querySelector("style[data-pstack-css]") !== null) return;
  const tag = document.createElement("style");
  tag.dataset.pstackCss = "";
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
