# Lab 03 Test Questions

20 questions against the `3IQ_SM` semantic model (see `LabFiles/Lab01/3IQ_SM.pbix`). Ask each one in the 3IQ Jumpstart app, compare the answer with the expected answer, and open the DAX panel to compare the generated query with the reference DAX.

## How to use

1. Pick a model in the model picker and work through Q01-Q20.
2. For each question, check the answer and inspect the DAX the agent ran.

## Metric definitions

| Metric | Definition |
|---|---|
| On time delivery rate (OTD) | Orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). |
| Fill rate | Units received (capped at units ordered per order) divided by units ordered, delivered orders only. |
| Overdue | Not yet delivered and past the due date. |
| Late delivery | Delivered after the due date. |
| Short quantity | Ordered units minus received units, never below zero, delivered orders only. |

---

## 1. How are we doing overall

### Q01. What percentage of our orders arrive on time?

| | |
|---|---|
| Difficulty | Medium |
| Tests | OTD denominator trap: delivered plus overdue open |

**Expected answer:** 81.9%

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date).

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR AsOf = TODAY()
VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
RETURN
    ROW("OTD %", DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted)))
```

</details>

### Q02. How much of what we order actually shows up?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Fill rate: delivered only, received capped at ordered |

**Expected answer:** 97.3%

**Metric definition:** Fill rate = units received (capped at units ordered per order) divided by units ordered, delivered orders only.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR Delivered = FILTER('F Order', NOT ISBLANK('F Order'[delivery_date]))
RETURN
    ROW("Fill Rate", DIVIDE(
        SUMX(Delivered, MIN('F Order'[received_qty], 'F Order'[ordered_qty])),
        SUMX(Delivered, 'F Order'[ordered_qty])
    ))
```

</details>

### Q03. Is our on time delivery getting better or worse over the last three months?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Relative months, trend by due month without relying on the date table relationship |

**Expected answer:** Jul 2026 82.4%; Aug 2026 82.0%; Sep 2026 81.7% (declining)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Grouped by the month the orders were due. Last three full months.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
ADDCOLUMNS(
    SELECTCOLUMNS(
        {EOMONTH(TODAY(), -4) + 1, EOMONTH(TODAY(), -3) + 1, EOMONTH(TODAY(), -2) + 1},
        "Due Month", [Value]
    ),
    "OTD %",
        VAR AsOf = TODAY()
        VAR MonthStart = [Due Month]
        VAR MonthEnd = EOMONTH(MonthStart, 0)
        VAR Counted = FILTER('F Order', 'F Order'[due_date] >= MonthStart && 'F Order'[due_date] <= MonthEnd && (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
        VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
        RETURN
            DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
)
ORDER BY [Due Month]
```

</details>

---

## 2. Which suppliers are the problem

### Q04. Which supplier lets us down the most on timing?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Grouped ratio plus TOPN ascending |

**Expected answer:** Redwood Chilled Logistics at 67.5% (next lowest: Gateway Commodities at 71.0%)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date).

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Supplier'[Supplier Name],
        "OTD %",
            VAR AsOf = TODAY()
            VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
            VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
            RETURN
                DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
    ),
    [OTD %], ASC
)
```

</details>

### Q05. Which suppliers are falling short of an 80% on time target?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Filter on a computed ratio per group, returns a list |

**Expected answer:** 6 suppliers:

- Redwood Chilled Logistics 67.5%
- Gateway Commodities 71.0%
- Delta Wellness Partners 71.6%
- Pacific Rim Imports 73.0%
- Kopi Lane Wholesale 77.1%
- Lotus Household Supply 79.0%

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Target is 80%.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
FILTER(
    SUMMARIZECOLUMNS(
        'Dim Supplier'[Supplier Name],
        "OTD %",
            VAR AsOf = TODAY()
            VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
            VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
            RETURN
                DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
    ),
    [OTD %] < 0.8
)
ORDER BY [OTD %] ASC
```

</details>

### Q06. How much do we order in total from suppliers that are below 80% on time?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Two step logic: find suppliers below a threshold, then total a different measure for them |

**Expected answer:** 19,177,779.60 (42.0% of all order value)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Target is 80%. Order value is the total value of all orders placed, delivered or not.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR BelowTarget =
    FILTER(
        SUMMARIZECOLUMNS(
            'Dim Supplier'[Supplier Name],
            "OTD %",
                VAR AsOf = TODAY()
                VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
                VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
                RETURN
                    DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
        ),
        [OTD %] < 0.8
    )
RETURN
    ROW(
        "Order Value With Suppliers Below 80% OTD",
        CALCULATE(
            SUM('F Order'[order_value]),
            TREATAS(
                SELECTCOLUMNS(BelowTarget, "Supplier Name", 'Dim Supplier'[Supplier Name]),
                'Dim Supplier'[Supplier Name]
            )
        )
    )
```

</details>

### Q07. Which supplier shorts us the most?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Grouped SUMX with MAX floor, TOPN descending |

**Expected answer:** Kopi Lane Wholesale with 25,731 units (next: NorthPeak Consumer with 23,920)

**Metric definition:** Short quantity = ordered units minus received units, never below zero, delivered orders only.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Supplier'[Supplier Name],
        "Short Qty",
            SUMX(FILTER('F Order', NOT ISBLANK('F Order'[delivery_date])), MAX('F Order'[ordered_qty] - 'F Order'[received_qty], 0))
    ),
    [Short Qty], DESC
)
```

</details>

### Q08. When Redwood Chilled Logistics is late, how late is it on average?

| | |
|---|---|
| Difficulty | Medium |
| Tests | AVERAGEX on late orders only, not all delivered |

**Expected answer:** 2.9 days

**Metric definition:** Late delivery = delivered after the due date. Days late = delivery date minus due date, averaged over late deliveries only.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
ROW(
    "Avg Days Late (late orders only)",
    AVERAGEX(
        FILTER('F Order', RELATED('Dim Supplier'[Supplier Name]) = "Redwood Chilled Logistics" && NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] > 'F Order'[due_date]),
        DATEDIFF('F Order'[due_date], 'F Order'[delivery_date], DAY)
    )
)
```

</details>

### Q09. What are the most common reasons given for late deliveries?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Group by a free text column, count with a filter, TOPN |

**Expected answer:** Port congestion (605); Supplier production delay (577); Customs clearance delay (544)

**Metric definition:** Late delivery = delivered after the due date. Reasons come from the comments column; blank comments are ignored.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    3,
    ADDCOLUMNS(
        FILTER(VALUES('F Order'[comments]), NOT ISBLANK('F Order'[comments])),
        "Late Deliveries",
            CALCULATE(COUNTROWS(FILTER('F Order', NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] > 'F Order'[due_date])))
    ),
    [Late Deliveries], DESC
)
```

</details>

---

## 3. Which stores are affected

### Q10. Which country gets the worst on time delivery?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Different dimension, same OTD logic, TOPN ascending |

**Expected answer:** Thailand at 81.3% (next: Malaysia at 81.5%)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date).

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Store'[Country],
        "OTD %",
            VAR AsOf = TODAY()
            VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
            VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
            RETURN
                DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
    ),
    [OTD %], ASC
)
```

</details>

### Q11. Which country does Redwood Chilled Logistics perform worst in?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Drill down: supplier filter then group by country |

**Expected answer:** Singapore at 62.6% (next: Vietnam at 65.6%)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Only Redwood Chilled Logistics orders.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Store'[Country],
        TREATAS({"Redwood Chilled Logistics"}, 'Dim Supplier'[Supplier Name]),
        "OTD %",
            VAR AsOf = TODAY()
            VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
            VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
            RETURN
                DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
    ),
    [OTD %], ASC
)
```

</details>

### Q12. Which three stores get hit hardest by late deliveries from Redwood Chilled Logistics?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Drill down: supplier filter, group by store, TOPN 3 |

**Expected answer:** Seminyak Store (37 late); Bangkok Sukhumvit Store (31 late); Jurong East Store (30 late)

**Metric definition:** Late delivery = delivered after the due date. Only Redwood Chilled Logistics orders.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    3,
    SUMMARIZECOLUMNS(
        'Dim Store'[Store Name],
        TREATAS({"Redwood Chilled Logistics"}, 'Dim Supplier'[Supplier Name]),
        "Late Deliveries",
            COUNTROWS(FILTER('F Order', NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] > 'F Order'[due_date]))
    ),
    [Late Deliveries], DESC
)
```

</details>

---

## 4. Which product categories are affected

### Q13. Which product category has the worst on time delivery?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Product dimension, same OTD logic, TOPN ascending |

**Expected answer:** Health and Wellness at 78.4% (next: Household Cleaning at 80.8%)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date).

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Product'[Product Category],
        "OTD %",
            VAR AsOf = TODAY()
            VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
            VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
            RETURN
                DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
    ),
    [OTD %], ASC
)
```

</details>

### Q14. Which product category gets shorted the most?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Fill rate logic inside a group, TOPN ascending |

**Expected answer:** Household Cleaning at 96.6% (next: Pantry Staples at 96.8%)

**Metric definition:** Fill rate = units received (capped at units ordered per order) divided by units ordered, delivered orders only. "Shorted the most" means the lowest fill rate.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Product'[Product Category],
        "Fill Rate",
            VAR Delivered = FILTER('F Order', NOT ISBLANK('F Order'[delivery_date]))
            RETURN
                DIVIDE(
                    SUMX(Delivered, MIN('F Order'[received_qty], 'F Order'[ordered_qty])),
                    SUMX(Delivered, 'F Order'[ordered_qty])
                )
    ),
    [Fill Rate], ASC
)
```

</details>

### Q15. Which product categories does Redwood Chilled Logistics let us down on the most?

| | |
|---|---|
| Difficulty | Hard |
| Tests | Drill down: supplier filter then group by category, sorted list |

**Expected answer:** Household Cleaning 65.9%; Pantry Staples 67.8%; Frozen Foods 69.1%

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Only Redwood Chilled Logistics orders; show every category it supplies, worst first.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
SUMMARIZECOLUMNS(
    'Dim Product'[Product Category],
    TREATAS({"Redwood Chilled Logistics"}, 'Dim Supplier'[Supplier Name]),
    "OTD %",
        VAR AsOf = TODAY()
        VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
        VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
        RETURN
            DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
)
ORDER BY [OTD %] ASC
```

</details>

---

## 5. What do we do about it

### Q16. How many orders are overdue right now?

| | |
|---|---|
| Difficulty | Easy |
| Tests | Blank handling plus today's date |

**Expected answer:** 391

**Metric definition:** Overdue = not yet delivered and past the due date.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR AsOf = TODAY()
RETURN
    ROW("Overdue Orders", COUNTROWS(FILTER('F Order', ISBLANK('F Order'[delivery_date]) && 'F Order'[due_date] < AsOf)))
```

</details>

### Q17. How much money is tied up in overdue orders?

| | |
|---|---|
| Difficulty | Easy |
| Tests | Blank handling, SUMX over a filter |

**Expected answer:** 732,118.68

**Metric definition:** Overdue = not yet delivered and past the due date. Order value is the value of the order as placed.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR AsOf = TODAY()
RETURN
    ROW("Overdue Order Value", SUMX(FILTER('F Order', ISBLANK('F Order'[delivery_date]) && 'F Order'[due_date] < AsOf), 'F Order'[order_value]))
```

</details>

### Q18. Which store is waiting on the most overdue orders?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Grouped count over a filtered fact, TOPN |

**Expected answer:** Jurong East Store with 34 (next: Bangsar Store with 31)

**Metric definition:** Overdue = not yet delivered and past the due date.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Store'[Store Name],
        "Overdue Orders",
            VAR AsOf = TODAY()
            RETURN
                COUNTROWS(FILTER('F Order', ISBLANK('F Order'[delivery_date]) && 'F Order'[due_date] < AsOf))
    ),
    [Overdue Orders], DESC
)
```

</details>

### Q19. Which supplier owes us the most overdue orders?

| | |
|---|---|
| Difficulty | Medium |
| Tests | Grouped count over a filtered fact, TOPN |

**Expected answer:** NorthPeak Consumer with 45 (next: Sunvale Distribution with 43)

**Metric definition:** Overdue = not yet delivered and past the due date.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
TOPN(
    1,
    SUMMARIZECOLUMNS(
        'Dim Supplier'[Supplier Name],
        "Overdue Orders",
            VAR AsOf = TODAY()
            RETURN
                COUNTROWS(FILTER('F Order', ISBLANK('F Order'[delivery_date]) && 'F Order'[due_date] < AsOf))
    ),
    [Overdue Orders], DESC
)
```

</details>

### Q20. If we wanted to move volume away from Redwood Chilled Logistics, who is the best alternative?

The question as asked: "If we wanted to move volume away from Redwood Chilled Logistics, who is the best alternative? Look at suppliers that already supply the same product categories."

| | |
|---|---|
| Difficulty | Hard |
| Tests | Subquery: derive a category set from one supplier, filter other suppliers to it, rank |

**Expected answer:** Harbour Fresh Trading at 91.4% on 700 orders in those categories (next: Meridian Foods at 88.5%)

**Metric definition:** On time delivery rate = orders delivered on or before the due date, divided by (delivered orders plus undelivered orders already past their due date). Only orders in the product categories that Redwood Chilled Logistics supplies, and Redwood Chilled Logistics itself is excluded.

<details>
<summary>Reference DAX</summary>

```dax
EVALUATE
VAR WorstSupplierCategories =
    CALCULATETABLE(
        SUMMARIZE('F Order', 'Dim Product'[Product Category]),
        'Dim Supplier'[Supplier Name] = "Redwood Chilled Logistics"
    )
RETURN
    TOPN(
        1,
        FILTER(
            SUMMARIZECOLUMNS(
                'Dim Supplier'[Supplier Name],
                TREATAS(WorstSupplierCategories, 'Dim Product'[Product Category]),
                "OTD %",
                    VAR AsOf = TODAY()
                    VAR Counted = FILTER('F Order', (NOT ISBLANK('F Order'[delivery_date]) || 'F Order'[due_date] < AsOf))
                    VAR OnTime = FILTER(Counted, NOT ISBLANK('F Order'[delivery_date]) && 'F Order'[delivery_date] <= 'F Order'[due_date])
                    RETURN
                        DIVIDE(COUNTROWS(OnTime), COUNTROWS(Counted))
            ),
            'Dim Supplier'[Supplier Name] <> "Redwood Chilled Logistics"
        ),
        [OTD %], DESC
    )
```

</details>
