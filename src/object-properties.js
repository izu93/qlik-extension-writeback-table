export default {
  qHyperCubeDef: {
    qDimensions: [],
    qMeasures: [],
    qInitialDataFetch: [
      {
        qWidth: 10,
        qHeight: 100, // Increased from 50 to 100 rows
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
    allowSorting: true,
    allowWriteback: true,
    rowAlternation: true,
    pageSize: 100, // Default page size
  },
  paginationOptions: {
    enabled: true,     // Enable pagination by default
    pageSize: 100,     // Default rows per page
    pageSizes: [25, 50, 100, 250],
  },
};