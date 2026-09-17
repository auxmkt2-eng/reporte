# Reporte Innvida en tiempo real

Este reporte contiene la misma configuración Firebase que la herramienta de Innvida y escucha, en tiempo real, la colección `cotizaciones` de cada fuente configurada.

Puede arrancar el servidor desde la carpeta raíz con `ABRIR-DASHBOARD.cmd` y abrir `http://localhost:4173/reporte-tiempo-real/`, o servir esta carpeta con cualquier servidor estático. No abra el HTML directamente, porque Firebase requiere HTTP/HTTPS.

Las gráficas muestran: KAM con más y menos cotizaciones, las cotizaciones individuales de mayor monto y las oportunidades abiertas con más días sin gestión. Para antigüedad, usa la última fecha de seguimiento disponible; si no existe, usa la fecha de emisión y lo indica en pantalla.
