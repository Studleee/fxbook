export interface SheetWriteOk {
  ok: true;
  pair: string;
  setting: string;
}

export interface SheetWriteErr {
  ok: false;
  error: string;
  code:
    | 'unknown_pair'
    | 'unknown_setting'
    | 'missing_spreadsheet'
    | 'missing_binding'
    | 'invalid_value'
    | 'auth'
    | 'spreadsheet_not_found'
    | 'sheet_not_found'
    | 'write_failed'
    | 'network';
}

export type SheetWriteResult = SheetWriteOk | SheetWriteErr;
