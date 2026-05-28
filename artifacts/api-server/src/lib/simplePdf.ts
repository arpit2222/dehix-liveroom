type PdfLine = {
  text: string;
  size?: number;
  gapAfter?: number;
};

function toPdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

export function buildSimplePdf(title: string, sections: PdfLine[]): Buffer {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 54;
  const topY = 790;
  const bottomY = 54;
  const pages: string[][] = [[]];
  let y = topY;

  const addCommand = (line: string) => {
    pages[pages.length - 1]?.push(line);
  };

  const addPage = () => {
    pages.push([]);
    y = topY;
  };

  const addText = (text: string, size = 11, gapAfter = 8) => {
    const maxChars = size >= 16 ? 56 : 84;
    const wrapped = wrapText(text, maxChars);
    const lineHeight = Math.ceil(size * 1.35);

    for (const part of wrapped) {
      if (y < bottomY) {
        addPage();
      }
      addCommand(`BT /F1 ${size} Tf ${marginX} ${y} Td (${toPdfText(part)}) Tj ET`);
      y -= lineHeight;
    }

    y -= gapAfter;
  };

  addText(title, 20, 16);
  addText(`Generated on ${new Date().toLocaleDateString()}`, 9, 18);

  for (const section of sections) {
    addText(section.text, section.size ?? 11, section.gapAfter ?? 8);
  }

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const kids: number[] = [];
  for (const page of pages) {
    const pageObj = objects.length;
    const contentObj = pageObj + 1;
    kids.push(pageObj);
    const stream = page.join("\n");
    objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "ascii");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "ascii");
}
