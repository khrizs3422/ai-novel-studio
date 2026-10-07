# Protocolo editorial y de producción

> Documento de ejemplo. Define las reglas de calidad que el escritor debe
> cumplir capítulo a capítulo, con independencia del proveedor de modelo.

## Elección del modelo
El servidor `scripts/novel-writer-server.js` es **agnóstico del proveedor**: sólo
necesita un endpoint compatible con la API de OpenAI (`/chat/completions`) y un
modelo que elijas. Criterios aplicados al elegir uno para una novela larga en español:

- **Contexto amplio**: debe caber la biblia, la escaleta y la prosa acumulada sin truncar.
- **Cuota gratuita formal**: se prefiere un tier gratuito declarado por el proveedor,
  nunca elusión de límites ni cuentas no autorizadas.
- **Estabilidad de voz**: no conviene cambiar de modelo dentro de un mismo arco
  narrativo; afecta la continuidad del estilo.
- **Sin fallback pagado**: si el endpoint falla o devuelve `429`, el sistema registra
  el error y espera; no salta a un modelo con costo de forma automática.

## Flujo por capítulo
1. Completar paquete de escena: POV, objetivo, conflicto, giro, cliffhanger.
2. Generar **un** borrador (`POST /draft`).
3. Revisar historiografía, anacronismos, continuidad y estereotipos.
4. Corregir manualmente o con una segunda pasada explícita.
5. Recién entonces avanzar al capítulo siguiente.

## Límites de ejecución
- Lote inicial: capítulos 1–2 solamente.
- Meta por capítulo: 1.800–2.200 palabras; no más de 4.000 tokens por petición.
- Pausa obligatoria después de cada lote para auditoría de calidad.
- Si el proveedor devuelve `429` o falla, registrar el fallo y no cambiar
  silenciosamente de modelo.

## Criterios de rechazo
Rechazar o reescribir un borrador si contiene:
- magia real, profecías o "poderes indígenas";
- Incas ocupando directamente territorio huilliche;
- narrador que habla de "Chile", "Chile prehispánico" o "españoles que pronto
  llegarán" como conocimiento de los personajes;
- feudalismo/castillos/coronas europeas maquilladas;
- vocabulario indígena inventado u ornamental;
- metatexto de IA, prefacios o explicaciones del proceso.
