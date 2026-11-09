/** Stylesheet for the pstack client dialog and its pages. */

const CSS = `
.pstack-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pstack-mask {
  position: absolute;
  inset: var(--dsh-frame-chrome-top, 0px) 0 0;
  border: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
  cursor: default;
}
.pstack-panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 800px;
  max-width: calc(100vw - 48px);
  height: min(800px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px))));
  border-radius: var(--dsw-radius-panel);
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent);
}
.pstack-panel:focus {
  outline: none;
}
.pstack-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 16px 8px 24px;
}
.pstack-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.pstack-tabs-row {
  padding: 6px 24px 0;
}
.pstack-segmented {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 4px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover);
}
.pstack-segmented-indicator {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(
    (100% - 8px - 2px * (var(--pstack-segment-count) - 1)) / var(--pstack-segment-count)
  );
  height: calc(100% - 8px);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft);
  transform: translate(calc(var(--pstack-segment-index) * (100% + 2px)));
  transition: transform 0.16s ease;
  pointer-events: none;
}
.pstack-segment {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  height: 30px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.12s ease;
}
.pstack-segment[aria-selected="true"] {
  color: var(--dsw-alias-label-primary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 6px;
}
.pstack-segment:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}
.pstack-segment:focus-visible {
  outline: none;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}
.pstack-body {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.pstack-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.pstack-section-head > div:first-child {
  flex: 1;
  min-width: 0;
}
.pstack-section-desc {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.pstack-section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
}
.pstack-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.pstack-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.pstack-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.pstack-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
.pstack-btn-outline {
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: transparent;
}
.pstack-btn-outline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.pstack-btn-ghost {
  color: var(--dsw-alias-label-secondary);
}
.pstack-btn-ghost:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.pstack-btn-sm {
  height: 28px;
  gap: 4px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-sm);
  font-size: 12px;
  line-height: 18px;
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
.pstack-icon-btn:focus-visible,
.pstack-btn:focus-visible,
.pstack-switch:focus-visible {
  outline: var(--dsw-focus-ring-width) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.pstack-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.pstack-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.pstack-status[data-tone="success"] {
  color: var(--dsw-alias-state-success-primary);
}
.pstack-status[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.pstack-status[data-tone="warn"] {
  color: var(--dsw-alias-state-warn-primary);
}
.pstack-status[data-tone="brand"] {
  color: var(--dsw-alias-state-business-primary);
}
.pstack-status[data-tone="neutral"] {
  color: var(--dsw-alias-label-tertiary);
}
.pstack-switch {
  box-sizing: border-box;
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
}
.pstack-switch[aria-checked="true"] {
  background: var(--dsw-alias-brand-primary);
}
.pstack-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.pstack-switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 0.12s ease;
}
.pstack-switch[aria-checked="true"] .pstack-switch-thumb {
  transform: translate(16px);
}
.pstack-switch[aria-checked="false"] .pstack-switch-thumb {
  background: var(--dsw-alias-switch-thumb);
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
.pstack-plugin-group-desc {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
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
.pstack-plugin-card[data-conflict="true"] {
  border-color: color-mix(
    in srgb,
    var(--dsw-alias-state-error-primary) 35%,
    var(--dsw-alias-settings-card-stroke)
  );
}
.pstack-plugin-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
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
.pstack-budget-overlay {
  z-index: 1004;
}
.pstack-budget-panel {
  display: flex;
  flex-direction: column;
  width: 780px;
  height: min(700px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top, 24px))));
}
.pstack-budget-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.pstack-budget-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 18px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
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
  border: 0.5px solid var(--dsw-alias-settings-card-stroke);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-settings-card-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.pstack-effort-hint > svg {
  flex: none;
  margin-top: 1px;
  color: var(--dsw-alias-label-tertiary);
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
.pstack-tag {
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xs);
  color: var(--dsw-alias-label-secondary);
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
.pstack-role-line {
  color: var(--dsw-alias-label-dimmed);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
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
.pstack-toast {
  position: fixed;
  z-index: 1002;
  top: max(24px, var(--dsh-frame-overlay-top, 24px));
  left: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100vw - 48px);
  padding: 8px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 18px;
  transform: translateX(-50%);
}
.pstack-toast[data-tone="success"] {
  color: var(--dsw-alias-state-success-primary);
}
.pstack-toast[data-tone="warn"] {
  color: var(--dsw-alias-state-warn-primary);
}
.pstack-toast[data-tone="error"] {
  color: var(--dsw-alias-state-error-primary);
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
  margin-top: 8px;
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
.pstack-file-meta > span:not(.pstack-status) {
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
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
}
.pstack-spinner {
  animation: pstack-spin 0.8s linear infinite;
}
@keyframes pstack-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pstack-spinner,
  .pstack-segmented-indicator,
  .pstack-switch-thumb {
    animation: none;
    transition: none;
  }
}
@media (width <= 600px) {
  .pstack-panel {
    width: 100%;
    max-width: none;
    height: 100%;
    border-radius: 0;
  }
  .pstack-header {
    padding: 16px 12px 8px 16px;
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
