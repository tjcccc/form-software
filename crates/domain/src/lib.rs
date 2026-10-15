//! Pure schema, record, and API value contracts. No network, filesystem, or database access.
mod model;
mod validation;
pub use model::*;
pub use validation::*;
