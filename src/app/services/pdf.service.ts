import {Injectable} from '@angular/core';
import {jsPDF} from 'jspdf';

@Injectable({
  providedIn: 'root'
})
export class PdfService {

  constructor() {
  }

  public exportAsPdfFile(source: any, json: any[], pdfFileName: string) {
    const doc = new jsPDF();


    doc.html(source, {
      'width': 190
    });

    doc.save(pdfFileName + '.pdf');
  }
}
