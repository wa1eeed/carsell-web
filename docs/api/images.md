# Listing images — blur before storage

## Why the upload path changed

R2 uploads are **signed and direct from the browser** for brand and dealer logos:
the file never touches the Next server, so no request carries megabytes and no
container memory is spent.

Listing photos **cannot work that way**. A number plate identifies its owner —
whoever photographs it knows the number, and whoever knows the number can reach
a name and address through third-party services. So blurring is a publishing
precondition, not an enhancement.

And an image that travels from browser to storage is never seen by the server,
so the server cannot blur it. A signed direct upload makes "saved blurred" a
promise nobody is in a position to keep.

Listing images therefore go **through the server**: normalise → blur → hash →
store. `storeObject` writes the processed bytes; the original is never stored at
all. Keeping it "for review" would mean the plate is in storage and the leak is
now a permissions question rather than a data question.

Order matters: the hash is computed **after** blurring, because it is the hash of
what will be stored. Hashing before would make two copies of one listing look
different merely because their plates differ.

## The detector, and what it gets wrong

Geometric, not a learned model: it looks for rectangles at the Saudi plate ratio
(2.4:1) with high horizontal edge density, in the lower half of the frame.
Letters and digits produce dense horizontal contrast in a small area, which is
what separates a plate from the smooth bodywork around it.

**It errs in two directions, and they are not equal:**

| Error | Consequence |
|---|---|
| False positive | A blurred patch where no plate is. Annoying, and visible. |
| False negative | A readable plate published. **Irreversible.** |

So thresholds are tuned toward catching, and the seller sees the result and can
add a manual blur — the last guarantee, not the first.

Two calibration mistakes were found by testing rather than by reading:

- **A relative threshold alone fires on a smooth image.** Its mean edge density
  is near zero, so everything is a multiple of it, and an empty sky gets blurred.
  An absolute floor says "there are no edges here at all", which no multiple can.
- **Ranking by density alone selects a sliver of the plate.** A small window
  inside a plate is denser than the whole plate, so the blur covered part of the
  number and left the rest readable. Ranking by density × area fixes it.

Non-image input is returned unchanged rather than throwing. An upload arriving
from a browser must produce a clean rejection, not a 500 with no message.

## Perceptual hash

dHash, not SHA. Two visually identical images have different SHAs if one was
re-saved at a different quality — and re-saving is exactly what someone
re-posting another listing's photos does.

dHash compares each pixel to its horizontal neighbour, so it survives brightness,
size and compression changes, and breaks under heavy cropping — which it should,
because a heavy crop really is a different image.

Decision 33 puts a duplicate over 90% into review. 90% of 64 bits is a Hamming
distance of at most 6, which is what is measured — not a percentage estimated by
eye.

A duplicate sends the listing to review and **does not reject it**: someone with
two listings for one car may reuse a photo in good faith, and rejecting punishes
them while review exposes the copier.

## Tested

`tests/images.test.ts` asserts the plate region's sharpness falls to under half
after blurring — the blur is real, not a flag. It also asserts no blur on a
smooth frame and on a noisy frame with no plate, and that the hash survives
re-compression and resizing while separating different images.

## VIN lookup — failure is a path, not an error

Acceptance: **lookup fails ⇒ manual entry**. Manual is not a fallback; it is a
first-class path of the same rank. No vehicle-data integration exists in phase 1,
and any seller may hold a vehicle no provider knows.

What is extracted comes **from the number itself**, not from a service: model
year from position 10, manufacturer from the first three characters. What cannot
be extracted is left empty for the seller to fill — never guessed.

Three outcomes, three codes, because the screen does something different with
each:

| Outcome | Code | Screen |
|---|---|---|
| Valid, partially decoded | `200` | Fills what it knows, marks it "fetched" |
| Malformed | `VIN_INVALID` | Says which check failed |
| Format-valid, unknown | `VIN_NOT_RECOGNISED` | Opens manual entry and says why |
| Already listed | `VIN_ALREADY_LISTED` | Stops — one car, one listing |

Collapsing these into one error would make the screen ask the seller for a
different VIN they do not have.

The WMI table is deliberately short — the makes actually sold in Saudi Arabia.
Expanding it to thousands of codes inherits maintenance with no matching use, and
the unknown case already lands somewhere correct.

`ALREADY_LISTED` blocks because one car with two listings corrupts every count
and every price statistic.

## Proven at the storage boundary

`tests/listing-images.test.ts` replaces the store with a spy and asserts the
**bytes handed to storage** are blurred — not the output of the blur function in
isolation. A test that measures only the blur proves blurring works; it does not
prove that what gets stored is the blurred copy, and one line separates the two.

It also asserts the hash matches the stored bytes (hash after blur), that a
non-image never reaches storage, and that what is stored is normalised JPEG
rather than the original format.
