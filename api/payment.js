export default function handler(req, res) {
  // 1) Validar headers básicos
  const auth = req.headers.authorization || "";
  const accept = (req.headers.accept || "").toLowerCase();

  // Se quiser exigir accept:
  // if (!accept.includes("application/json")) {
  //   return res.status(406).json({ message: "Not Acceptable. Use accept: application/json" });
  // }

  // Exigir Bearer
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: missing Bearer token" });
  }

  // 2) Ler query params
  const {
    pageId,
    TotalPerPage,
    resellerDocument,
    merchantDocuments,
    createdSince,
    createdUntil,
    updatedSince,
    updatedUntil,
    TransactionType,
    NsuAcquirer,
    NsuProvider,
    OrderBy,
    OrderDirection,
    status,
  } = req.query;

  // pageId é obrigatório na doc
  const page = Number(pageId || 0);
  if (!page || page < 1) {
    return res.status(400).json({ message: "Bad Request: pageId is required and must be >= 1" });
  }

  const perPage = Math.min(Math.max(Number(TotalPerPage || 25), 1), 200);

  // 3) Dataset fake (você pode aumentar depois)
  const all = [
    {
      nsuProvider: "470",
      nsuAcquirer: "001984160493",
      terminalIdentifiers: { SerialNumber: "6N123456", Model: "PAX - S123" },
      fees: {
        resellerRate: "0.89",
        merchantRate: 3.0,
        planName: "PB_Teste03",
        antecipation: 1,
        planId: 99053,
        percentAmount: "3.00",
        feesSpread: 3.0,
      },
      product: "POS",
      id: 123456789,
      merchantDocument: "54321399000131",
      resellerDocument: "48650971000103",
      authorizationNumber: "123456",
      status: "Confirmed",
      amountInCents: 5400,
      netAmountInCents: 5185,
      feeAmountInCents: 215,
      createdAt: "2024-10-01T10:00:00-03:00",
      updatedAt: "2024-10-01T12:00:00-03:00",
      paymentMethod: "credit",
      installmentMethod: "Issuer",
      installments: 1,
      card: {
        cardBrand: "MasterCard",
        cardFirstSixDigits: "123456",
        cardHolderName: "",
        cardLastFourDigits: "0000",
        cardBrandId: 2,
      },
      installmentMethodCode: 2,
      paymentMethodCode: 1,
      productCode: 2,
      statusCode: 5,
      uuidPhoebus: "fake-uuid",
      responseMessage: "Sucesso",
      simcardSerialNumber: "",
      transactionType: "pos",
      refundedValue: 0,
    },
    {
      nsuProvider: "471",
      nsuAcquirer: "001984160494",
      terminalIdentifiers: { SerialNumber: "6N654321", Model: "PAX - A910" },
      fees: {
        resellerRate: "1.10",
        merchantRate: 4.69,
        planName: "EVLX - DEB. 2,99 CRED. 4,69 - ANT 22",
        antecipation: 1,
        planId: 99054,
        percentAmount: "4.69",
        feesSpread: 3.22,
      },
      product: "Pos",
      id: 64492146,
      merchantDocument: "11111111000199",
      resellerDocument: "48650971000103",
      authorizationNumber: "664421",
      status: "Pending",
      amountInCents: 10000,
      netAmountInCents: 9600,
      feeAmountInCents: 400,
      createdAt: "2024-10-01T14:00:00-03:00",
      updatedAt: "2024-10-01T14:10:00-03:00",
      paymentMethod: "debit",
      installmentMethod: "Issuer",
      installments: 1,
      card: {
        cardBrand: "Visa",
        cardFirstSixDigits: "654321",
        cardHolderName: "",
        cardLastFourDigits: "1234",
        cardBrandId: 1,
      },
      installmentMethodCode: 2,
      paymentMethodCode: 2,
      productCode: 2,
      statusCode: 2,
      uuidPhoebus: "fake-uuid-2",
      responseMessage: "Pendente",
      simcardSerialNumber: "",
      transactionType: "pos",
      refundedValue: 0,
    },
  ];

  // 4) Filtros simples (opcionais)
  let filtered = [...all];

  if (resellerDocument) {
    filtered = filtered.filter(p => p.resellerDocument === String(resellerDocument));
  }

  if (merchantDocuments) {
    // merchantDocuments pode vir como string única ou array dependendo do client
    const arr = Array.isArray(merchantDocuments) ? merchantDocuments : [merchantDocuments];
    filtered = filtered.filter(p => arr.includes(p.merchantDocument));
  }

  if (TransactionType) {
    filtered = filtered.filter(p => p.transactionType === String(TransactionType).toLowerCase());
  }

  if (NsuAcquirer) filtered = filtered.filter(p => p.nsuAcquirer === String(NsuAcquirer));
  if (NsuProvider) filtered = filtered.filter(p => p.nsuProvider === String(NsuProvider));

  // status na doc é int (1..6), mas no exemplo também tem status text.
  // Aqui vou aceitar int e mapear:
  const statusMap = {
    1: "Denied",
    2: "Pending",
    3: "Undone",
    4: "Refused",
    5: "Confirmed",
    6: "Cancelled",
  };
  if (status) {
    const s = statusMap[Number(status)] || String(status);
    filtered = filtered.filter(p => p.status === s);
  }

  // createdSince/Until (bem básico, comparando ISO)
  const toIso = (s) => {
    if (!s) return null;
    // aceita "2024-10-01 00:00:00" ou ISO
    const normalized = String(s).replace(" ", "T");
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  };

  const cs = toIso(createdSince);
  const cu = toIso(createdUntil);
  if ((createdSince && !cs) || (createdUntil && !cu)) {
    return res.status(400).json({ message: "Bad Request: invalid createdSince/createdUntil date format" });
  }
  if ((createdSince && !createdUntil) || (!createdSince && createdUntil)) {
    return res.status(400).json({ message: "Bad Request: createdSince requires createdUntil (and vice-versa)" });
  }
  if (cs && cu) {
    filtered = filtered.filter(p => {
      const d = new Date(p.createdAt);
      return d >= cs && d <= cu;
    });
  }

  // 5) Paginação
  const totalRecords = filtered.length;
  const lastPage = Math.max(1, Math.ceil(totalRecords / perPage));
  const start = (page - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  // 6) Resposta no formato da doc
  return res.status(200).json({
    actualPage: page,
    payments: pageItems,
    totalRecords,
    perPage,
    lastPage,
  });
}
