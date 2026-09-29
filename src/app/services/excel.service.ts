import {Injectable} from '@angular/core';

const EXCEL_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8';

const EXCEL_EXTENSION = '.xlsx';

@Injectable({
  providedIn: 'root'
})
export class ExcelService {

  // xlsx is large and only needed for the accounting export, so it loads on first use.
  public async exportAsExcelFile(json: any[], excelFileName: string): Promise<void> {
    const [XLSX, {saveAs}] = await Promise.all([import('xlsx'), import('file-saver')]);

    const worksheet = XLSX.utils.json_to_sheet(json);
    const workbook = {Sheets: {'data': worksheet}, SheetNames: ['data']};
    const excelBuffer = XLSX.write(workbook, {bookType: 'xlsx', type: 'array'});

    saveAs(new Blob([excelBuffer], {type: EXCEL_TYPE}), excelFileName + EXCEL_EXTENSION);
  }
}
