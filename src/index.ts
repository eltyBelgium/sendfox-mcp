import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

const SENDFOX_API_BASE = "https://api.sendfox.com";

export class SendFoxMCP extends McpAgent<Env> {
	server = new McpServer({
		name: "SendFox MCP",
		version: "1.0.0",
	});

	async init() {
		const getToken = () => {
			const token = this.env.SENDFOX_API_TOKEN;
			if (!token) throw new Error("SENDFOX_API_TOKEN is not configured");
			return token;
		};

		const apiFetch = async (path: string, options: RequestInit = {}) => {
			const token = getToken();
			const response = await fetch(`${SENDFOX_API_BASE}${path}`, {
				...options,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
					...options.headers,
				},
			});

			if (response.status === 204) return null;

			const data = await response.json();

			if (!response.ok) {
				const message = (data as { message?: string }).message ?? response.statusText;
				throw new Error(`SendFox API error ${response.status}: ${message}`);
			}

			return data;
		};

		// ── User ──────────────────────────────────────────────────────────────

		this.server.tool(
			"get_me",
			"Retrieve authenticated SendFox user information",
			{},
			async () => {
				const data = await apiFetch("/me");
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		// ── Contacts ──────────────────────────────────────────────────────────

		this.server.tool(
			"get_contacts",
			"Retrieve a paginated list of contacts (100 per page)",
			{ page: z.number().int().positive().optional().describe("Page number (default: 1)") },
			async ({ page }) => {
				const query = page ? `?page=${page}` : "";
				const data = await apiFetch(`/contacts${query}`);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"get_contact",
			"Retrieve a specific contact by ID or email address",
			{
				id: z.number().int().positive().optional().describe("Contact ID"),
				email: z.string().email().optional().describe("Contact email address"),
			},
			async ({ id, email }) => {
				if (!id && !email) throw new Error("Provide either 'id' or 'email'");
				const path = id ? `/contacts/${id}` : `/contacts?email=${encodeURIComponent(email!)}`;
				const data = await apiFetch(path);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"create_contact",
			"Create a new contact",
			{
				email: z.string().email().describe("Contact email address"),
				first_name: z.string().optional().describe("First name"),
				last_name: z.string().optional().describe("Last name"),
				lists: z
					.array(z.number().int().positive())
					.optional()
					.describe("List IDs to add the contact to"),
				tags: z.array(z.string()).optional().describe("Tags to assign"),
				custom_fields: z
					.record(z.string(), z.union([z.string(), z.number()]))
					.optional()
					.describe("Custom field key/value pairs"),
			},
			async (body) => {
				const data = await apiFetch("/contacts", {
					method: "POST",
					body: JSON.stringify(body),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"import_contacts",
			"Bulk import up to 1,000 contacts",
			{
				contacts: z
					.array(
						z.object({
							email: z.string().email(),
							first_name: z.string().optional(),
							last_name: z.string().optional(),
							lists: z.array(z.number().int().positive()).optional(),
							tags: z.array(z.string()).optional(),
							custom_fields: z
								.record(z.string(), z.union([z.string(), z.number()]))
								.optional(),
						}),
					)
					.max(1000)
					.describe("Array of contact objects (max 1,000)"),
			},
			async ({ contacts }) => {
				const data = await apiFetch("/contacts/import", {
					method: "POST",
					body: JSON.stringify({ contacts }),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"delete_contact",
			"Delete a contact by ID",
			{ id: z.number().int().positive().describe("Contact ID to delete") },
			async ({ id }) => {
				await apiFetch(`/contacts/${id}`, { method: "DELETE" });
				return { content: [{ type: "text", text: `Contact ${id} deleted successfully.` }] };
			},
		);

		// ── Lists ─────────────────────────────────────────────────────────────

		this.server.tool(
			"get_lists",
			"Retrieve a paginated list of contact lists",
			{ page: z.number().int().positive().optional().describe("Page number (default: 1)") },
			async ({ page }) => {
				const query = page ? `?page=${page}` : "";
				const data = await apiFetch(`/lists${query}`);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"get_list",
			"Retrieve a specific contact list by ID",
			{ id: z.number().int().positive().describe("List ID") },
			async ({ id }) => {
				const data = await apiFetch(`/lists/${id}`);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"create_list",
			"Create a new contact list",
			{ name: z.string().describe("Name of the new list") },
			async ({ name }) => {
				const data = await apiFetch("/lists", {
					method: "POST",
					body: JSON.stringify({ name }),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"delete_list",
			"Soft-delete a contact list by ID (returns error if list is used by forms, landing pages, or automations)",
			{ id: z.number().int().positive().describe("List ID to delete") },
			async ({ id }) => {
				await apiFetch(`/lists/${id}`, { method: "DELETE" });
				return { content: [{ type: "text", text: `List ${id} deleted successfully.` }] };
			},
		);

		this.server.tool(
			"add_contact_to_list",
			"Add an existing contact to a list",
			{
				list_id: z.number().int().positive().describe("List ID"),
				contact_id: z.number().int().positive().describe("Contact ID to add"),
			},
			async ({ list_id, contact_id }) => {
				const data = await apiFetch(`/lists/${list_id}/contacts`, {
					method: "POST",
					body: JSON.stringify({ contact_id }),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		// ── Campaigns ─────────────────────────────────────────────────────────

		this.server.tool(
			"get_campaigns",
			"Retrieve a paginated list of campaigns",
			{ page: z.number().int().positive().optional().describe("Page number (default: 1)") },
			async ({ page }) => {
				const query = page ? `?page=${page}` : "";
				const data = await apiFetch(`/campaigns${query}`);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"get_campaign",
			"Retrieve a specific campaign by ID",
			{ id: z.number().int().positive().describe("Campaign ID") },
			async ({ id }) => {
				const data = await apiFetch(`/campaigns/${id}`);
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"create_campaign",
			"Create a new draft campaign",
			{
				name: z.string().describe("Internal campaign name"),
				subject: z.string().describe("Email subject line"),
				body: z.string().describe("HTML or plain-text email body"),
				from_name: z.string().optional().describe("Sender display name"),
				from_email: z.string().email().optional().describe("Sender email address"),
				list_ids: z
					.array(z.number().int().positive())
					.optional()
					.describe("List IDs to send to"),
				scheduled_at: z
					.string()
					.optional()
					.describe("ISO 8601 datetime to schedule the campaign (omit to keep as draft)"),
			},
			async (body) => {
				const data = await apiFetch("/campaigns", {
					method: "POST",
					body: JSON.stringify(body),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"update_campaign",
			"Update a draft campaign (only draft campaigns can be updated)",
			{
				id: z.number().int().positive().describe("Campaign ID"),
				name: z.string().optional().describe("Internal campaign name"),
				subject: z.string().optional().describe("Email subject line"),
				body: z.string().optional().describe("HTML or plain-text email body"),
				from_name: z.string().optional().describe("Sender display name"),
				from_email: z.string().email().optional().describe("Sender email address"),
				list_ids: z
					.array(z.number().int().positive())
					.optional()
					.describe("List IDs to send to"),
				scheduled_at: z
					.string()
					.optional()
					.describe("ISO 8601 datetime to schedule the campaign"),
			},
			async ({ id, ...rest }) => {
				const data = await apiFetch(`/campaigns/${id}`, {
					method: "PUT",
					body: JSON.stringify(rest),
				});
				return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
			},
		);

		this.server.tool(
			"delete_campaign",
			"Soft-delete a draft campaign (only draft campaigns can be deleted)",
			{ id: z.number().int().positive().describe("Campaign ID to delete") },
			async ({ id }) => {
				await apiFetch(`/campaigns/${id}`, { method: "DELETE" });
				return {
					content: [{ type: "text", text: `Campaign ${id} deleted successfully.` }],
				};
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return SendFoxMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
