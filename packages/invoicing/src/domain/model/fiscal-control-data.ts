export interface FiscalControlData {
  readonly jurisdiction: string;
  readonly controlNumber?: string | undefined;
  readonly machineFiscalSerial?: string | undefined;
  readonly taxExemptionCertificate?: string | undefined;
  readonly jurisdictionStateCode?: string | undefined;
}
