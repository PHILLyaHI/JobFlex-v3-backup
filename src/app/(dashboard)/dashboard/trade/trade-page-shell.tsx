"use client";
import * as React from "react";
import { TradeTabs, type TradeTab } from "@/components/trade/TradeTabs";
import { TradeBoardClient } from "./trade-board-client";
import {
  InfluencerDashboard,
  type StatementRow,
  type PayoutRow,
} from "@/components/trade/InfluencerDashboard";

interface Post {
  id: string;
  title: string;
  body: string;
  category: string | null;
  status: string;
  authorName: string | null;
  authorEmail: string;
  replyCount: number;
  createdAt: Date;
}

interface Props {
  posts: Post[];
  activeCategory: string;
  statements: StatementRow[];
  payouts: PayoutRow[];
  currentPeriod: string;
}

export function TradePageShell({ posts, activeCategory, statements, payouts, currentPeriod }: Props) {
  const [tab, setTab] = React.useState<TradeTab>("posts");
  return (
    <>
      <TradeTabs active={tab} onChange={setTab} />
      {tab === "posts" ? (
        <TradeBoardClient posts={posts} activeCategory={activeCategory} />
      ) : (
        <InfluencerDashboard
          statements={statements}
          payouts={payouts}
          currentPeriod={currentPeriod}
        />
      )}
    </>
  );
}
