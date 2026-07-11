import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function waitForImages(doc) {
  const images = [...(doc.images || [])];
  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );
}

/**
 * Render print-style HTML into a PDF blob (same look as Print).
 */
export async function htmlToPdfBlob(html, { orientation = "portrait", filename = "document.pdf" } = {}) {
  const iframe = document.createElement("iframe");
  const widthPx = orientation === "landscape" ? 1123 : 794;
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:1200px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    await waitForImages(doc);
    await new Promise((r) => setTimeout(r, 50));

    const target = doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });

    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
    heightLeft -= pageH;

    while (heightLeft > 1) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    const blob = pdf.output("blob");
    return new File([blob], filename, { type: "application/pdf" });
  } finally {
    iframe.remove();
  }
}
