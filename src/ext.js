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
            // Add sorting options
            sortingOptions: {
              type: "items",
              label: "Sorting Options",
              items: {
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
              },
            },
            // Keep only the writeback column labels section
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
