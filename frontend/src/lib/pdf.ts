import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AnalysisResponse, Priority } from '../api/types';
import { cropName, SEASON_LABEL } from './crops';
import { formatoFecha, PRIORITY_LABEL } from './etiquetas';

const VERDE: [number, number, number] = [63, 125, 74];
const ESTADO = { ok: 'Bien', warn: 'Atención', danger: 'Crítico' } as const;
const INCERTIDUMBRE = { low: 'baja', medium: 'media', high: 'alta' } as const;

type DocConTabla = jsPDF & { lastAutoTable: { finalY: number } };
const finalY = (d: jsPDF) => (d as DocConTabla).lastAutoTable.finalY;

interface Extra {
  crop: string | null;
  priority: Priority | null;
}

// OJO: las fuentes estándar de PDF solo traen caracteres latinos (acentos y ñ sí). No uses flechas, emojis ni símbolos raros.
export function exportarPlanPdf(a: AnalysisResponse, { crop, priority }: Extra): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  let y = 18;

  const titulo = (texto: string) => {
    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...VERDE);
    doc.text(texto, 14, y);
    y += 4;
  };
  const parrafo = (texto: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(60);
    const lineas = doc.splitTextToSize(texto, ancho - 28);
    doc.text(lineas, 14, y + 4);
    y += lineas.length * 5 + 6;
  };
  const tabla = (head: string[], body: string[][]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: VERDE },
      margin: { left: 14, right: 14, bottom: 20 }, // deja espacio para el pie de página
    });
    y = finalY(doc) + 10;
  };

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...VERDE);
  doc.text('Field Shift - Plan de rotación', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60);
  const datos = [
    `Fecha del análisis: ${formatoFecha(a.createdAt)}`,
    `Ubicación: ${a.location.lat.toFixed(4)}, ${a.location.lon.toFixed(4)}  ·  Superficie: ${a.areaHa.toFixed(1)} ha`,
    crop ? `Cultivo actual: ${cropName(crop)}` : '',
    priority ? `Prioridad: ${PRIORITY_LABEL[priority]}` : '',
  ].filter(Boolean);
  for (const linea of datos) { doc.text(linea, 14, y); y += 5; }
  y += 5;

  // Rotación
  titulo('Rotación recomendada');
  tabla(
    ['Temporada', 'Cultivo', 'Siembra', 'Puntaje', 'Ahorro de agua', 'Nitrógeno (estimado)'],
    a.rotation.map((r) => [
      SEASON_LABEL[r.season], cropName(r.cropId), r.plantingWindow, `${r.score} / 100`,
      `${r.waterSavingPct} %`, `${r.nitrogenDelta > 0 ? '+' : ''}${r.nitrogenDelta} kg/ha`,
    ]),
  );
  tabla(
    ['Cultivo', 'Por qué se recomienda', 'Riesgos'],
    a.rotation.map((r) => [
      cropName(r.cropId),
      r.reasons.map((x) => `- ${x}`).join('\n'),
      r.risks.length ? r.risks.map((x) => `- ${x}`).join('\n') : 'Sin riesgos registrados',
    ]),
  );

  // Métricas NASA
  titulo('Datos de la NASA para la parcela');
  tabla(
    ['Métrica', 'Valor', 'Estado', 'Significado'],
    a.metrics.map((m) => [m.label, `${m.value} ${m.unit}`, ESTADO[m.status], `${m.meaning} (${m.source})`]),
  );

  // Impacto y suelo
  titulo('Impacto estimado');
  tabla(
    ['Indicador', 'Actual', 'Con la rotación'],
    a.impact.map((i) => [i.label, `${i.current} ${i.unit}`, `${i.recommended} ${i.unit}`]),
  );
  parrafo(`Salud del suelo (estimada por reglas): ${a.soilHealth.current} / 100 ahora, ${a.soilHealth.recommended} / 100 con la rotación.`);

  // Incertidumbre
  titulo('Incertidumbre');
  parrafo(`Nivel ${INCERTIDUMBRE[a.uncertainty.level]}. ${a.uncertainty.reason}.`);

  // Pie de cada página
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    const nota = doc.splitTextToSize('Clima: NASA POWER. Recomendación por reglas agronómicas; el nitrógeno y la salud del suelo son estimaciones.', ancho - 60);
    doc.text(nota, 14, 284);
    doc.text(`Página ${i} de ${paginas}`, ancho - 14, 284, { align: 'right' });
  }

  doc.save(`plan-rotacion-${a.id}.pdf`);
}
