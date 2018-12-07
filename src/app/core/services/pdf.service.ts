import {Injectable} from '@angular/core';
import * as jsPDF from 'jspdf';

@Injectable({
  providedIn: 'root'
})
export class PdfService {

  constructor() {
  }

  public exportAsPdfFile(source: any, json: any[], pdfFileName: string) {
    const doc = new jsPDF();

    const specialElementHandlers = {
      '#editor': function (element, renderer) {
        return true;
      }
    };


    doc.fromHTML(source, 15, 15, {
      'width': 190,
      'elementHandlers': specialElementHandlers
    });

    doc.save(pdfFileName + '.pdf');
  }
}
