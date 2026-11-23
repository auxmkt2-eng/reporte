const palette = {
  ink: '14201F', green: '1F6F54', gold: 'B58A3E', red: 'A92E23',
  paleRed: 'FCE8E4', light: 'EEF3EF', white: 'FFFFFF', soft: '52605D'
};
const currency = '"$"#,##0.00;[Red]("$"#,##0.00)';
const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } });
const formatDate = date => date.toLocaleDateString('es-MX');
const excelDate = date => date && new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

export function buildCommercialWorkbook(ExcelJS, data) {
  const { start, end, metrics, kams, quotes, active, billing } = data;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INNVIDA';
  const period = `Periodo aplicado: ${formatDate(start)} al ${end ? formatDate(end) : 'corte disponible'} · MXN`;

  function addSheet(name, title, note, columns, records, { highlightDays = 0, filter = true } = {}) {
    const sheet = workbook.addWorksheet(name, {
      properties: { tabColor: { argb: 'FF' + (highlightDays ? palette.red : palette.green) } },
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    sheet.pageSetup.printTitlesRow = '1:5';
    sheet.columns = columns.map(([, width]) => ({ width }));

    for (const [rowNumber, value] of [[1, title], [2, period], [3, note]]) {
      sheet.mergeCells(rowNumber, 1, rowNumber, columns.length);
      const cell = sheet.getCell(rowNumber, 1);
      cell.value = value;
      cell.fill = fill(rowNumber === 1 ? palette.ink : palette.light);
      cell.font = { name: 'Calibri', size: rowNumber === 1 ? 18 : 11, bold: rowNumber < 3,
        color: { argb: 'FF' + (rowNumber === 1 ? palette.white : palette.soft) } };
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      sheet.getRow(rowNumber).height = rowNumber === 1 ? 34 : 26;
    }

    const header = sheet.getRow(5);
    header.values = columns.map(([label]) => label);
    header.height = 30;
    header.eachCell(cell => {
      cell.fill = fill(palette.green);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + palette.gold } } };
    });

    records.forEach((values, index) => {
      const row = sheet.addRow(values);
      row.height = 25;
      columns.forEach(([, , numFmt], columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        cell.fill = fill(index % 2 ? palette.light : palette.white);
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF' + palette.ink } };
        cell.alignment = { vertical: 'middle', horizontal: numFmt || typeof cell.value === 'number' ? 'right' : 'left', indent: 1 };
        if (numFmt) cell.numFmt = numFmt;
      });
      if (highlightDays && values[highlightDays - 1] >= 7) {
        const cell = row.getCell(highlightDays);
        cell.fill = fill(palette.paleRed);
        cell.font = { bold: true, color: { argb: 'FF' + palette.red } };
      }
    });

    if (filter && records.length) {
      sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: sheet.rowCount, column: columns.length } };
    }
    if (!records.length) {
      sheet.mergeCells(6, 1, 6, columns.length);
      sheet.getCell('A6').value = 'Sin registros para el periodo aplicado.';
      sheet.getCell('A6').font = { italic: true, color: { argb: 'FF' + palette.soft } };
      sheet.getRow(6).height = 22;
    }
  }

  const generatedAt = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City'
  }).format(new Date());
  addSheet('Resumen ejecutivo', 'INNVIDA | Reporte comercial', `Generado el ${generatedAt} (hora de Ciudad de México).`,
    [['Indicador', 41], ['Registros', 16], ['Monto (MXN)', 22, currency], ['Alcance', 59]],
    [
      ['Monto facturado', billing.length, metrics.billedAmount, 'Registros facturados en captura SAI'],
      ['Monto cotizado total', quotes.length, metrics.quotedAmount, 'Cotizaciones Firebase del periodo'],
      ['Pipeline abierto', active.length, metrics.openAmount, 'Cotizaciones activas del periodo'],
      ['Sin gestión (7 días o más)', metrics.staleCount, metrics.staleAmount, `${metrics.staleCount} de ${active.length} cotizaciones activas (${metrics.stalePercentage}%)`],
      ['Oportunidad abierta más antigua', null, null, metrics.oldest
        ? `${metrics.oldest.dias} días · ${metrics.oldest.folio} · ${metrics.oldest.kam}` : 'Sin fechas disponibles']
    ], { filter: false });

  addSheet('Desempeño KAM', 'Desempeño por KAM', 'Ordenado por volumen. Usa el filtro de Excel para invertir el orden.',
    [['KAM', 52], ['Cotizaciones', 20], ['Monto cotizado (MXN)', 29, currency]],
    [...kams].sort((a, b) => b.count - a.count).map(row => [row.kam, row.count, row.amount]));

  const quoteColumns = [
    ['Emisión', 16, 'dd/mm/yyyy'], ['Folio', 20], ['KAM', 48], ['Médico', 52],
    ['Paciente', 48], ['Cotización (MXN)', 23, currency]
  ];
  const quoteValues = row => [excelDate(row.fecha), String(row.folio), row.kam, row.medico, row.paciente, row.monto];

  addSheet('Cotizaciones', 'Cotizaciones por monto', 'Todas las cotizaciones del periodo, de mayor a menor importe.',
    [...quoteColumns, ['Estatus', 29], ['Fuente', 23]],
    [...quotes].sort((a, b) => b.monto - a.monto).map(row => [...quoteValues(row), row.status, row.source]));

  addSheet('Seguimiento', 'Seguimiento de cotizaciones abiertas', 'En rojo, oportunidades con 7 días o más sin gestión. Si falta el seguimiento, se usa la emisión.',
    [...quoteColumns, ['Días sin gestión', 22], ['Estatus', 29], ['Referencia de antigüedad', 30]],
    [...active].sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1)).map(row => [
      ...quoteValues(row), row.dias, row.status, row.hasFollowUp ? 'Última gestión' : 'Emisión'
    ]), { highlightDays: 7 });

  addSheet('Facturación SAI', 'Detalle de facturación SAI', 'Registros que componen el monto facturado del periodo.',
    [['Fecha de infusión', 25, 'dd/mm/yyyy'], ['Monto del servicio (MXN)', 48, currency]],
    [...billing].sort((a, b) => b.fecha - a.fecha).map(row => [excelDate(row.fecha), row.monto]));

  return workbook;
}

export async function downloadCommercialWorkbook(data) {
  const workbook = buildCommercialWorkbook(globalThis.ExcelJS, data);
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const stamp = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `INNVIDA-reporte-comercial_${stamp(data.start)}_${data.end ? stamp(data.end) : 'al-corte'}.xlsx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
