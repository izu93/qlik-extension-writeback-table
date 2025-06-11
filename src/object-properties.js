export default {
  qHyperCubeDef: {
    qDimensions: [],
    qMeasures: [],
    qInitialDataFetch: [
      {
        qWidth: 10,
        qHeight: 100,
      },
    ],
  },
  showTitles: true,
  title: "",
  subtitle: "",
  footnote: "",
  disableNavMenu: false,
  showDetails: false,
  tableOptions: {
    allowSelections: true,
    allowWriteback: true,
    rowAlternation: true,
    pageSize: 100,
  },
  paginationOptions: {
    enabled: true,
    pageSize: 100,
    pageSizes: [25, 50, 100, 250],
  },
};
