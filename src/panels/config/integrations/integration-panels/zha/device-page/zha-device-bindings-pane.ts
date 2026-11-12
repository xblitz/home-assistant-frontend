import type { ContextType } from "@lit/context";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../../../../common/decorators/consume";
import "../../../../../../components/data-table/ha-data-table";
import type {
  DataTableColumnContainer,
  DataTableRowData,
} from "../../../../../../components/data-table/ha-data-table";
import "../../../../../../components/ha-button";
import "../../../../../../components/ha-card";
import "../../../../../../components/ha-spinner";
import { narrowViewportContext } from "../../../../../../data/context";
import type {
  ZHADevice,
  ZHADeviceBinding,
  ZHAGroup,
} from "../../../../../../data/zha";
import {
  fetchBindableDevices,
  fetchDeviceBindings,
  fetchDevices,
  fetchGroups,
  ZHADeviceType,
} from "../../../../../../data/zha";
import { haStyle } from "../../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../../types";
import "../zha-device-binding";
import {
  getZHADeviceAreaName,
  sortZHADevices,
  sortZHAGroups,
} from "../functions";
import "../zha-group-binding";

interface CurrentBindingRowData extends DataTableRowData {
  id: string;
  source_endpoint: number;
  cluster: string;
  target: string;
  area: string | undefined;
  target_endpoint: number | undefined;
}

@customElement("zha-device-bindings-pane")
export class ZHADeviceBindingsPane extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public device?: ZHADevice;

  @state()
  @consume({ context: narrowViewportContext, subscribe: true })
  private _narrow!: ContextType<typeof narrowViewportContext>;

  @state() private _bindableDevices: ZHADevice[] = [];

  @state() private _groups: ZHAGroup[] = [];

  @state() private _loaded = false;

  @state() private _error?: string;

  @state() private _currentBindings?: ZHADeviceBinding[];

  @state() private _devices?: Map<string, ZHADevice>;

  @state() private _fetchingBindings = false;

  @state() private _bindingsError = false;

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);

    const oldDevice = changedProperties.get("device");
    const deviceChanged =
      changedProperties.has("device") && this.device?.ieee !== oldDevice?.ieee;

    if (deviceChanged) {
      this._bindableDevices = [];
      this._groups = [];
      this._loaded = false;
      this._error = undefined;
      this._currentBindings = undefined;
      this._fetchingBindings = false;
      this._bindingsError = false;
      this._fetchBindings();
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.device) {
      return nothing;
    }

    if (!this._loaded) {
      return html`
        <ha-card class="loading-card">
          <ha-spinner size="large"></ha-spinner>
        </ha-card>
      `;
    }

    if (this._error) {
      return html`<ha-card class="empty-card">${this._error}</ha-card>`;
    }

    return html`
      <ha-card class="binding-card">
        <div class="binding-section-header">
          <div class="binding-section-title">
            ${this.hass.localize("ui.panel.config.zha.current_bindings.header")}
          </div>
          <div class="binding-section-description">
            ${this.hass.localize(
              "ui.panel.config.zha.current_bindings.introduction"
            )}
          </div>
        </div>
        <div class="current-bindings-actions">
          <ha-button
            @click=${this._fetchCurrentBindings}
            .disabled=${this._fetchingBindings}
          >
            ${this.hass.localize(
              "ui.panel.config.zha.current_bindings.get_bindings"
            )}
          </ha-button>
          ${
            this._fetchingBindings
              ? html`<ha-spinner size="small"></ha-spinner>`
              : nothing
          }
        </div>
        ${
          this._bindingsError
            ? html`
                <div class="current-bindings-message">
                  ${this.hass.localize(
                    "ui.panel.config.zha.current_bindings.load_failed"
                  )}
                </div>
              `
            : nothing
        }
        ${
          this._currentBindings !== undefined
            ? this._currentBindings.length
              ? html`
                  <ha-data-table
                    .columns=${this._bindingsColumns(this._narrow)}
                    .data=${this._currentBindingRows(
                      this._currentBindings,
                      this._devices,
                      this._groups,
                      this.hass.areas,
                      this.hass.devices
                    )}
                    auto-height
                    .searchLabel=${this.hass.localize(
                      "ui.components.data-table.search"
                    )}
                    .noDataText=${this.hass.localize(
                      "ui.panel.config.zha.current_bindings.no_bindings_found"
                    )}
                  ></ha-data-table>
                `
              : html`
                  <div class="current-bindings-message">
                    ${this.hass.localize(
                      "ui.panel.config.zha.current_bindings.no_bindings_found"
                    )}
                  </div>
                `
            : nothing
        }
      </ha-card>
      ${
        this._bindableDevices.length
          ? html`
              <ha-card class="binding-card">
                <div class="binding-section-header">
                  <div class="binding-section-title">
                    ${this.hass.localize(
                      "ui.panel.config.zha.device_binding.header"
                    )}
                  </div>
                  <div class="binding-section-description">
                    ${this.hass.localize(
                      "ui.panel.config.zha.device_binding.introduction"
                    )}
                  </div>
                </div>
                <zha-device-binding-control
                  .hass=${this.hass}
                  .device=${this.device}
                  .bindableDevices=${this._bindableDevices}
                ></zha-device-binding-control>
              </ha-card>
            `
          : nothing
      }
      ${
        this._groups.length
          ? html`
              <ha-card class="binding-card">
                <div class="binding-section-header">
                  <div class="binding-section-title">
                    ${this.hass.localize(
                      "ui.panel.config.zha.group_binding.header"
                    )}
                  </div>
                  <div class="binding-section-description">
                    ${this.hass.localize(
                      "ui.panel.config.zha.group_binding.introduction"
                    )}
                  </div>
                </div>
                <zha-group-binding-control
                  .hass=${this.hass}
                  .device=${this.device}
                  .groups=${this._groups}
                ></zha-group-binding-control>
              </ha-card>
            `
          : nothing
      }
      ${
        !this._bindableDevices.length && !this._groups.length
          ? html`
              <ha-card class="empty-card">
                ${this.hass.localize(
                  "ui.panel.config.zha.device_page.no_bindings"
                )}
              </ha-card>
            `
          : nothing
      }
    `;
  }

  private _bindingsColumns = memoizeOne(
    (narrow: boolean): DataTableColumnContainer =>
      narrow
        ? {
            cluster: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.cluster"
              ),
              sortable: true,
              filterable: true,
              direction: "asc",
              flex: 2,
            },
            target: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.target"
              ),
              sortable: true,
              filterable: true,
              flex: 2,
            },
          }
        : {
            source_endpoint: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.source_endpoint"
              ),
              sortable: true,
              type: "numeric",
            },
            cluster: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.cluster"
              ),
              sortable: true,
              filterable: true,
              direction: "asc",
              flex: 2,
            },
            target: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.target"
              ),
              sortable: true,
              filterable: true,
              flex: 2,
            },
            area: {
              title: this.hass.localize("ui.panel.config.generic.headers.area"),
              sortable: true,
              filterable: true,
            },
            target_endpoint: {
              title: this.hass.localize(
                "ui.panel.config.zha.current_bindings.target_endpoint"
              ),
              sortable: true,
              type: "numeric",
            },
          }
  );

  private _currentBindingRows = memoizeOne(
    (
      bindings: ZHADeviceBinding[],
      devices: Map<string, ZHADevice> | undefined,
      groups: ZHAGroup[],
      areas: HomeAssistant["areas"],
      haDevices: HomeAssistant["devices"]
    ): CurrentBindingRowData[] =>
      bindings.map((binding, index) => {
        const cluster =
          binding.cluster_name ??
          `0x${binding.cluster_id.toString(16).padStart(4, "0")}`;

        if (binding.group_id !== undefined) {
          const group = groups.find(
            (entry) => entry.group_id === binding.group_id
          );
          return {
            id: String(index),
            source_endpoint: binding.source_endpoint,
            cluster,
            target:
              group?.name ??
              this.hass.localize(
                "ui.panel.config.zha.current_bindings.unknown_group",
                { id: binding.group_id }
              ),
            area: undefined,
            target_endpoint: undefined,
          };
        }

        const targetDevice = binding.target_ieee
          ? devices?.get(binding.target_ieee)
          : undefined;

        return {
          id: String(index),
          source_endpoint: binding.source_endpoint,
          cluster,
          target: targetDevice
            ? targetDevice.user_given_name || targetDevice.name
            : (binding.target_ieee ?? ""),
          area: targetDevice
            ? getZHADeviceAreaName(targetDevice, areas, haDevices)
            : undefined,
          target_endpoint: binding.target_endpoint,
        };
      })
  );

  private async _fetchBindings(): Promise<void> {
    if (!this.device || !this.hass) {
      return;
    }

    const ieee = this.device.ieee;

    try {
      const [bindableDevices, groups] = await Promise.all([
        this.device.device_type !== ZHADeviceType.Coordinator
          ? fetchBindableDevices(this.hass, ieee)
          : Promise.resolve([]),
        fetchGroups(this.hass),
      ]);

      if (this.device?.ieee !== ieee) {
        return;
      }

      this._bindableDevices = bindableDevices.sort(sortZHADevices);
      this._groups = groups.sort(sortZHAGroups);
    } catch (_err: any) {
      if (this.device?.ieee === ieee) {
        this._error = this.hass.localize(
          "ui.panel.config.zha.device_page.bindings_error"
        );
      }
    } finally {
      if (this.device?.ieee === ieee) {
        this._loaded = true;
      }
    }
  }

  private async _fetchCurrentBindings(): Promise<void> {
    if (!this.device || !this.hass) {
      return;
    }

    const ieee = this.device.ieee;

    this._fetchingBindings = true;
    this._bindingsError = false;

    try {
      const [bindings, devices] = await Promise.all([
        fetchDeviceBindings(this.hass, ieee),
        fetchDevices(this.hass),
      ]);

      if (this.device?.ieee !== ieee) {
        return;
      }

      this._devices = new Map(
        devices.map((device) => [device.ieee, device] as const)
      );
      this._currentBindings = bindings;
    } catch (_err: any) {
      if (this.device?.ieee === ieee) {
        this._bindingsError = true;
      }
    } finally {
      if (this.device?.ieee === ieee) {
        this._fetchingBindings = false;
      }
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        .binding-card {
          overflow: hidden;
        }

        .binding-section-header {
          padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2);
        }

        .binding-section-title {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }

        .binding-section-description {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
          margin-top: var(--ha-space-1);
        }

        .current-bindings-actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: 0 var(--ha-space-4) var(--ha-space-4);
        }

        .current-bindings-message {
          color: var(--secondary-text-color);
          padding: 0 var(--ha-space-4) var(--ha-space-4);
        }

        .loading-card,
        .empty-card {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8);
        }

        .empty-card {
          color: var(--secondary-text-color);
          text-align: center;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "zha-device-bindings-pane": ZHADeviceBindingsPane;
  }
}
