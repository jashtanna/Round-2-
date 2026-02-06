use shopify_function::prelude::*;
use shopify_function::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
struct Input {
    cart: Cart,
    shop: Shop,
}

#[derive(Clone, Debug, Deserialize)]
struct Cart {
    lines: Vec<CartLine>,
}

#[derive(Clone, Debug, Deserialize)]
struct CartLine {
    id: String,
    quantity: i64,
    merchandise: Merchandise,
}

#[derive(Clone, Debug, Deserialize)]
struct Merchandise {
    #[serde(rename = "__typename")]
    typename: Option<String>,
    id: Option<String>,
    product: Option<Product>,
}

#[derive(Clone, Debug, Deserialize)]
struct Product {
    id: String,
}

#[derive(Clone, Debug, Deserialize)]
struct Shop {
    metafield: Option<Metafield>,
}

#[derive(Clone, Debug, Deserialize)]
struct Metafield {
    value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct VolumeDiscountConfig {
    products: Vec<String>,
    #[serde(rename = "minQty")]
    min_qty: i64,
    #[serde(rename = "percentOff")]
    percent_off: f64,
}

#[derive(Clone, Debug, Serialize)]
struct FunctionRunResult {
    discounts: Vec<Discount>,
}

#[derive(Clone, Debug, Serialize)]
struct Discount {
    message: String,
    targets: Vec<Target>,
    value: Value,
}

#[derive(Clone, Debug, Serialize)]
struct Target {
    #[serde(rename = "cartLine")]
    cart_line: CartLineTarget,
}

#[derive(Clone, Debug, Serialize)]
struct CartLineTarget {
    id: String,
}

#[derive(Clone, Debug, Serialize)]
struct Value {
    percentage: Percentage,
}

#[derive(Clone, Debug, Serialize)]
struct Percentage {
    value: String,
}

impl Default for FunctionRunResult {
    fn default() -> Self {
        Self {
            discounts: vec![],
        }
    }
}

#[shopify_function]
fn run(input: Input) -> Result<FunctionRunResult> {
    let rules = match &input.shop.metafield {
        Some(metafield) => {
            match serde_json::from_str::<VolumeDiscountConfig>(&metafield.value) {
                Ok(rules) => rules,
                Err(_) => return Ok(FunctionRunResult::default()),
            }
        }
        None => return Ok(FunctionRunResult::default()),
    };

    if rules.products.is_empty() {
        return Ok(FunctionRunResult::default());
    }

    let mut item_counts: HashMap<String, i64> = HashMap::new();
    let mut qualifying_lines: HashMap<String, Vec<&CartLine>> = HashMap::new();

    for line in &input.cart.lines {
        if let Some(product) = &line.merchandise.product {
            let product_id = &product.id;
            
            if rules.products.contains(product_id) {
                *item_counts.entry(product_id.clone()).or_insert(0) += line.quantity;
                qualifying_lines.entry(product_id.clone()).or_default().push(line);
            }
        }
    }

    let mut discounts = Vec::new();

    for (product_id, total_quantity) in item_counts {
        if total_quantity >= rules.min_qty {
            if let Some(lines) = qualifying_lines.get(&product_id) {
                let targets: Vec<Target> = lines
                    .iter()
                    .map(|line| Target {
                        cart_line: CartLineTarget {
                            id: line.id.clone(),
                        },
                    })
                    .collect();

                if !targets.is_empty() {
                    discounts.push(Discount {
                        message: format!("Buy 2, get {}% off", rules.percent_off),
                        targets,
                        value: Value {
                            percentage: Percentage {
                                value: rules.percent_off.to_string(),
                            },
                        },
                    });
                }
            }
        }
    }

    Ok(FunctionRunResult { discounts })
}