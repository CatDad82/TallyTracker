import { TimeEntry, AppAssociation, MondayBoard, SystemSettings } from "../src/types.js";

const MONDAY_API_URL = "https://api.monday.com/v2";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function runGraphQL<T>(token: string, query: string, variables?: Record<string, any>): Promise<T> {
  if (!token) {
    throw new Error("Monday.com API token not provided");
  }

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Monday.com API HTTP error: ${response.status} - ${text}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    const msgs = result.errors.map(e => e.message).join("; ");
    throw new Error(`Monday.com GraphQL error: ${msgs}`);
  }

  if (!result.data) {
    throw new Error("No data returned from Monday.com");
  }

  return result.data;
}

export interface MondayItemDetails {
  id: string;
  name: string;
  board_id?: string;
  board_name?: string;
  status?: string;
  assignee?: string;
  due_date?: string;
}

export class MondayClient {
  static async getMe(token: string): Promise<string | null> {
    try {
      const data = await runGraphQL<{ me: { id: string } }>(token, "query { me { id } }");
      return data?.me?.id || null;
    } catch (e) {
      console.error("MondayClient.getMe failed", e);
      return null;
    }
  }

  static async getItem(token: string, itemId: string): Promise<MondayItemDetails | null> {
    const query = `
      query {
        items(ids: [${itemId}]) {
          id
          name
          board {
            id
            name
          }
          column_values {
            id
            text
            value
            column {
              title
            }
          }
        }
      }
    `;

    try {
      const data = await runGraphQL<{
        items?: Array<{
          id: string;
          name: string;
          board?: { id: string; name: string };
          column_values?: Array<{
            id: string;
            text: string;
            value: string;
            column?: { title: string };
          }>;
        }>;
      }>(token, query);

      const items = data.items || [];
      if (items.length === 0) return null;

      const item = items[0];
      const details: MondayItemDetails = {
        id: item.id,
        name: item.name,
        board_id: item.board?.id,
        board_name: item.board?.name
      };

      // Extract standard fields
      if (item.column_values) {
        for (const col of item.column_values) {
          const title = (col.column?.title || "").toLowerCase();
          const textVal = col.text || col.value;
          if (!textVal) continue;

          if (title.includes("status")) {
            details.status = textVal;
          } else if (title.includes("assignee") || title.includes("owner") || title.includes("person")) {
            details.assignee = textVal;
          } else if (title.includes("due") && title.includes("date")) {
            details.due_date = textVal;
          }
        }
      }

      return details;
    } catch (e) {
      console.error(`MondayClient.getItem(${itemId}) failed`, e);
      return null;
    }
  }

  static async getBoard(token: string, boardId: string): Promise<{ id: string; name: string } | null> {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          id
          name
        }
      }
    `;

    try {
      const data = await runGraphQL<{ boards?: Array<{ id: string; name: string }> }>(token, query);
      const boards = data.boards || [];
      return boards.length > 0 ? boards[0] : null;
    } catch (e) {
      console.error(`MondayClient.getBoard(${boardId}) failed`, e);
      return null;
    }
  }

  static async getOrCreateGroup(token: string, boardId: string, groupName: string): Promise<string> {
    // 1. Get existing groups
    const query = `
      query {
        boards(ids: [${boardId}]) {
          groups {
            id
            title
          }
        }
      }
    `;

    const getRes = await runGraphQL<{
      boards?: Array<{ groups?: Array<{ id: string; title: string }> }>;
    }>(token, query);

    const groups = getRes.boards?.[0]?.groups || [];
    const existing = groups.find(g => g.title.trim().toLowerCase() === groupName.trim().toLowerCase());
    if (existing) {
      return existing.id;
    }

    // 2. Create the group if it doesn't exist
    const mutation = `
      mutation {
        create_group(board_id: "${boardId}", group_name: "${groupName}") {
          id
        }
      }
    `;

    const createRes = await runGraphQL<{ create_group?: { id: string } }>(token, mutation);
    if (!createRes.create_group?.id) {
      throw new Error(`Failed to create group "${groupName}" on board ${boardId}`);
    }

    return createRes.create_group.id;
  }

  static async getItemsInGroup(token: string, boardId: string, groupId: string): Promise<Record<string, string>> {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          groups(ids: ["${groupId}"]) {
            items_page(limit: 500) {
              items {
                id
                name
              }
            }
          }
        }
      }
    `;

    try {
      const data = await runGraphQL<{
        boards?: Array<{
          groups?: Array<{
            items_page?: { items?: Array<{ id: string; name: string }> };
          }>;
        }>;
      }>(token, query);

      const items = data.boards?.[0]?.groups?.[0]?.items_page?.items || [];
      const map: Record<string, string> = {};
      items.forEach(itm => {
        map[itm.name.trim().toLowerCase()] = itm.id;
      });
      return map;
    } catch (e) {
      console.error(`MondayClient.getItemsInGroup failed`, e);
      return {};
    }
  }

  static async getOrCreateColumns(token: string, boardId: string, wanted: Array<{ title: string; type: string }>): Promise<Record<string, string>> {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            title
          }
        }
      }
    `;

    const getRes = await runGraphQL<{
      boards?: Array<{ columns?: Array<{ id: string; title: string }> }>;
    }>(token, query);

    const cols = getRes.boards?.[0]?.columns || [];
    const mapped: Record<string, string> = {};
    cols.forEach(c => {
      mapped[c.title.toLowerCase()] = c.id;
    });

    // Create missing ones
    for (const item of wanted) {
      const key = item.title.toLowerCase();
      if (mapped[key]) continue;

      const mutation = `
        mutation {
          create_column(board_id: "${boardId}", title: "${item.title}", column_type: ${item.type}) {
            id
          }
        }
      `;

      try {
        const createRes = await runGraphQL<{ create_column?: { id: string } }>(token, mutation);
        if (createRes.create_column?.id) {
          mapped[key] = createRes.create_column.id;
        }
      } catch (err) {
        console.warn(`Could not create column "${item.title}":`, err);
      }
    }

    return mapped;
  }

  static async createItem(token: string, boardId: string, name: string, columnValues: any, groupId?: string): Promise<string> {
    const cvString = JSON.stringify(JSON.stringify(columnValues)); // Monday API requires double-encoded JSON string literal
    const grpArg = groupId ? `, group_id: "${groupId}"` : "";

    const mutation = `
      mutation {
        create_item(board_id: "${boardId}", item_name: "${name}"${grpArg}, column_values: ${cvString}) {
          id
        }
      }
    `;

    const res = await runGraphQL<{ create_item?: { id: string } }>(token, mutation);
    if (!res.create_item?.id) {
      throw new Error("Failed to create item");
    }
    return res.create_item.id;
  }

  static async updateItem(token: string, boardId: string, itemId: string, columnValues: any): Promise<string> {
    const cvString = JSON.stringify(JSON.stringify(columnValues));

    const mutation = `
      mutation {
        change_multiple_column_values(board_id: "${boardId}", item_id: "${itemId}", column_values: ${cvString}) {
          id
        }
      }
    `;

    const res = await runGraphQL<{ change_multiple_column_values?: { id: string } }>(token, mutation);
    if (!res.change_multiple_column_values?.id) {
      throw new Error("Failed to update item");
    }
    return res.change_multiple_column_values.id;
  }
}
