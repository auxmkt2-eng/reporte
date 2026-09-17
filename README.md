# Reporte Innvida en tiempo real

Este reporte obtiene **Monto cotizado total** y **Pipeline abierto** exclusivamente de las fuentes Firebase de **Sanaré** (`sanare` y `nuevoSanare`); Nomad no se consulta. El **Monto facturado** se calcula con el campo `monto_del_servicio` de la tabla `cotizaciones` de Supabase de Llenado SAI y se actualiza al recibir cambios en esa tabla.

Todos los cálculos usan el mismo corte: registros desde el **01/06/2026** inclusive. En Firebase se filtra por fecha de emisión; en Llenado SAI se filtra por `fecha_infusion`.

Los cálculos y filtros de KAM homologan mayúsculas, acentos y variantes conocidas de nombre para no duplicar responsables en las gráficas.

También agrupa las variantes de Efraín Camarín con segundos apellidos bajo `EFRÁIN I. CAMARÍN`, `BERENICE ORDAZ NARANJO` bajo `BERENICE` y `SAMNTHA GUEVARA LEON` bajo `SAMANTHA GUEVARA LEÓN`. Valores fuera del catálogo de KAM se agrupan como `Sin KAM asignado` y no aparecen como opción de filtro ni en las gráficas de KAM.

Cada gráfica presenta todos los registros aplicables, no una selección de cinco. Los listados extensos tienen desplazamiento interno.

Puede arrancar el servidor desde la carpeta raíz con `ABRIR-DASHBOARD.cmd` y abrir `http://localhost:4173/reporte-tiempo-real/`, o servir esta carpeta con cualquier servidor estático. No abra el HTML directamente, porque Firebase requiere HTTP/HTTPS.

Las gráficas muestran: KAM con más y menos cotizaciones, las cotizaciones individuales de mayor monto y las oportunidades abiertas con más días sin gestión. Para antigüedad, usa la última fecha de seguimiento disponible; si no existe, usa la fecha de emisión y lo indica en pantalla.
