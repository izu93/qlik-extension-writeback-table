export default function ext(galaxy) {
  console.log("ext.js: Initializing extension settings with galaxy", galaxy);

  return {
    definition: {
      type: "items",
      component: "accordion",
      items: {
        data: {
          uses: "data",
          items: {
            dimensions: {
              min: 0,
              max: 10,
            },
            measures: {
              min: 0,
              max: 10,
            },
          },
        },
        settings: {
          uses: "settings",
          items: {
            tableSection: {
              type: "items",
              label: "Table Settings",
              items: {
                allowSelections: {
                  type: "boolean",
                  ref: "tableOptions.allowSelections",
                  label: "Enable Selections",
                  defaultValue: true,
                },
                allowSorting: {
                  type: "boolean",
                  ref: "tableOptions.allowSorting",
                  label: "Enable Sorting",
                  defaultValue: true,
                },
                showSortIcons: {
                  type: "boolean",
                  ref: "sortOptions.showSortIcons",
                  label: "Show Sort Icons",
                  defaultValue: true,
                },
                defaultSortDirection: {
                  type: "string",
                  component: "dropdown",
                  label: "Default Sort Direction",
                  ref: "sortOptions.defaultDirection",
                  options: [
                    {
                      value: "asc",
                      label: "Ascending",
                    },
                    {
                      value: "desc",
                      label: "Descending",
                    },
                  ],
                  defaultValue: "asc",
                },
                allowWriteback: {
                  type: "boolean",
                  ref: "tableOptions.allowWriteback",
                  label: "Enable Writeback",
                  defaultValue: true,
                },
                rowAlternation: {
                  type: "boolean",
                  ref: "tableOptions.rowAlternation",
                  label: "Alternate Row Colors",
                  defaultValue: true,
                },
              },
            },
            // Add pagination section
            paginationSection: {
              type: "items",
              label: "Pagination Settings",
              items: {
                enablePagination: {
                  type: "boolean",
                  ref: "paginationOptions.enabled",
                  label: "Enable Pagination",
                  defaultValue: true,
                },
                pageSize: {
                  type: "string",
                  component: "dropdown",
                  label: "Rows Per Page",
                  ref: "paginationOptions.pageSize",
                  options: [
                    {
                      value: 25,
                      label: "25 rows",
                    },
                    {
                      value: 50,
                      label: "50 rows",
                    },
                    {
                      value: 100,
                      label: "100 rows",
                    },
                    {
                      value: 250,
                      label: "250 rows",
                    },
                  ],
                  defaultValue: 100,
                  show: function (layout) {
                    return (
                      layout.paginationOptions &&
                      layout.paginationOptions.enabled
                    );
                  },
                },
              },
            },
            // Keep the writeback column labels section
            columnLabels: {
              type: "items",
              label: "Writeback Column Labels",
              items: {
                // Label customization for writeback columns
                statusLabel: {
                  type: "string",
                  ref: "columnLabels.status",
                  label: "Status Column Label",
                  defaultValue: "Status",
                  expression: "optional",
                },
                commentsLabel: {
                  type: "string",
                  ref: "columnLabels.comments",
                  label: "Comments Column Label",
                  defaultValue: "Comments",
                  expression: "optional",
                },
              },
            },
          },
        },
      },
    },
    support: {
      snapshot: true,
      export: true,
      exportData: true,
    },
  };
}
