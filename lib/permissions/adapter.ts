/**
 * Custom Casbin adapter for MongoDB 7.x.
 * Reads/writes policies from the `casbin_rule` collection.
 * Schema: { ptype, v0, v1, v2, v3, v4, v5 }
 */
import { Helper, Model, FilteredAdapter, Filter } from "casbin";
import { Db, Collection } from "mongodb";
import { getDb } from "@/utils/mongodb/client";

const COLLECTION = "casbin_rule";

interface CasbinRule {
  ptype: string;
  v0?: string;
  v1?: string;
  v2?: string;
  v3?: string;
  v4?: string;
  v5?: string;
}

function docToLine(doc: CasbinRule): string {
  const parts = [doc.ptype, doc.v0, doc.v1, doc.v2, doc.v3, doc.v4, doc.v5];
  return parts.filter((v) => v !== undefined && v !== "").join(", ");
}

function ruleToDoc(ptype: string, rule: string[]): CasbinRule {
  const doc: CasbinRule = { ptype };
  const keys = ["v0", "v1", "v2", "v3", "v4", "v5"] as const;
  rule.forEach((val, i) => {
    if (keys[i]) doc[keys[i]] = val;
  });
  return doc;
}

export class MongoAdapter implements FilteredAdapter {
  private db: Db | null = null;
  isFiltered = false;

  private async col(): Promise<Collection<CasbinRule>> {
    if (!this.db) this.db = await getDb();
    return this.db.collection<CasbinRule>(COLLECTION);
  }

  async loadPolicy(model: Model): Promise<void> {
    const col = await this.col();
    const docs = await col.find({}).toArray();
    for (const doc of docs) {
      const line = docToLine(doc);
      Helper.loadPolicyLine(line, model);
    }
  }

  async loadFilteredPolicy(model: Model, filter: Filter): Promise<void> {
    const col = await this.col();
    // Filter by domain (v1 for p-rules, v2 for g-rules)
    const query: Record<string, unknown> = {};
    if (filter.p && filter.p.length > 1) query.v1 = { $in: filter.p };
    if (filter.g && filter.g.length > 2) query.v2 = { $in: filter.g };
    const docs = await col.find(query).toArray();
    for (const doc of docs) {
      const line = docToLine(doc);
      Helper.loadPolicyLine(line, model);
    }
    this.isFiltered = true;
  }

  async savePolicy(model: Model): Promise<boolean> {
    const col = await this.col();
    await col.deleteMany({});
    const docs: CasbinRule[] = [];

    const policyMap = model.model.get("p");
    if (policyMap) {
      for (const [ptype, assertion] of policyMap) {
        for (const rule of assertion.policy) {
          docs.push(ruleToDoc(ptype, rule));
        }
      }
    }
    const roleMap = model.model.get("g");
    if (roleMap) {
      for (const [ptype, assertion] of roleMap) {
        for (const rule of assertion.policy) {
          docs.push(ruleToDoc(ptype, rule));
        }
      }
    }
    if (docs.length) await col.insertMany(docs);
    return true;
  }

  async addPolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    const col = await this.col();
    await col.insertOne(ruleToDoc(ptype, rule));
  }

  async removePolicy(_sec: string, ptype: string, rule: string[]): Promise<void> {
    const col = await this.col();
    await col.deleteOne(ruleToDoc(ptype, rule));
  }

  async removeFilteredPolicy(
    _sec: string,
    ptype: string,
    fieldIndex: number,
    ...fieldValues: string[]
  ): Promise<void> {
    const col = await this.col();
    const keys = ["v0", "v1", "v2", "v3", "v4", "v5"] as const;
    const query: Record<string, unknown> = { ptype };
    fieldValues.forEach((val, i) => {
      if (val !== "") query[keys[fieldIndex + i]] = val;
    });
    await col.deleteMany(query);
  }
}
