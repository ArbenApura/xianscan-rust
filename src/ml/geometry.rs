use super::schemas::BoxRect;

/// Converts a list of 2D points to an axis-aligned bounding rectangle.
pub fn points_to_box_rect(points: &[[i32; 2]]) -> BoxRect {
    if points.is_empty() {
        return BoxRect { x: 0, y: 0, w: 0, h: 0 };
    }
    let mut min_x = points[0][0];
    let mut max_x = points[0][0];
    let mut min_y = points[0][1];
    let mut max_y = points[0][1];

    for p in points.iter().skip(1) {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }

    BoxRect {
        x: min_x,
        y: min_y,
        w: (max_x - min_x).max(1),
        h: (max_y - min_y).max(1),
    }
}

pub fn polygon_bounds(polygon: &[[i32; 2]]) -> (i32, i32, i32, i32) {
    if polygon.is_empty() {
        return (0, 0, 0, 0);
    }
    let mut min_x = polygon[0][0];
    let mut max_x = polygon[0][0];
    let mut min_y = polygon[0][1];
    let mut max_y = polygon[0][1];

    for p in polygon.iter().skip(1) {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }
    (min_x, min_y, (max_x - min_x).max(1), (max_y - min_y).max(1))
}

pub fn is_vertical_box(rect: &BoxRect) -> bool {
    rect.h as f32 > (rect.w as f32) * 1.2
}

pub fn is_vertical_pts(pts: &[[i32; 2]]) -> bool {
    let r = points_to_box_rect(pts);
    is_vertical_box(&r)
}

pub fn is_vertical_f32(pts: &[[f32; 2]]) -> bool {
    if pts.is_empty() {
        return false;
    }
    let mut min_x = pts[0][0];
    let mut max_x = pts[0][0];
    let mut min_y = pts[0][1];
    let mut max_y = pts[0][1];
    for p in pts.iter().skip(1) {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }
    (max_y - min_y) > (max_x - min_x) * 1.2
}

pub fn box_to_xywh_f32(pts: &[[f32; 2]]) -> (f32, f32, f32, f32) {
    if pts.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }
    let mut min_x = pts[0][0];
    let mut max_x = pts[0][0];
    let mut min_y = pts[0][1];
    let mut max_y = pts[0][1];
    for p in pts.iter().skip(1) {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }
    (min_x, min_y, (max_x - min_x).max(1.0), (max_y - min_y).max(1.0))
}

pub fn box_iou(a: &BoxRect, b: &BoxRect) -> f32 {
    let ax1 = a.x + a.w;
    let ay1 = a.y + a.h;
    let bx1 = b.x + b.w;
    let by1 = b.y + b.h;

    let ix = (ax1.min(bx1) - a.x.max(b.x)).max(0);
    let iy = (ay1.min(by1) - a.y.max(b.y)).max(0);
    let inter = (ix * iy) as f32;
    let union = (a.w * a.h + b.w * b.h) as f32 - inter;

    if union > 0.0 {
        inter / union
    } else {
        0.0
    }
}

pub fn box_iou_pts(a: &[[i32; 2]], b: &[[i32; 2]]) -> f32 {
    let ra = points_to_box_rect(a);
    let rb = points_to_box_rect(b);
    box_iou(&ra, &rb)
}

pub fn box_iou_f32(a: &[[f32; 2]], b: &[[f32; 2]]) -> f32 {
    let (ax, ay, aw, ah) = box_to_xywh_f32(a);
    let (bx, by, bw, bh) = box_to_xywh_f32(b);

    let ax1 = ax + aw;
    let ay1 = ay + ah;
    let bx1 = bx + bw;
    let by1 = by + bh;

    let ix = (ax1.min(bx1) - ax.max(bx)).max(0.0);
    let iy = (ay1.min(by1) - ay.max(by)).max(0.0);
    let inter = ix * iy;
    let union = aw * ah + bw * bh - inter;

    if union > 0.0 {
        inter / union
    } else {
        0.0
    }
}

pub fn line_center_inside(line: &[[i32; 2]], region: &[[i32; 2]]) -> bool {
    let lr = points_to_box_rect(line);
    let rr = points_to_box_rect(region);
    let cx = lr.x as f32 + (lr.w as f32) / 2.0;
    let cy = lr.y as f32 + (lr.h as f32) / 2.0;
    cx >= rr.x as f32
        && cx <= (rr.x + rr.w) as f32
        && cy >= rr.y as f32
        && cy <= (rr.y + rr.h) as f32
}

pub fn line_center_inside_box(line: &[[i32; 2]], region: &BoxRect) -> bool {
    let lr = points_to_box_rect(line);
    let cx = lr.x as f32 + (lr.w as f32) / 2.0;
    let cy = lr.y as f32 + (lr.h as f32) / 2.0;
    cx >= region.x as f32
        && cx <= (region.x + region.w) as f32
        && cy >= region.y as f32
        && cy <= (region.y + region.h) as f32
}

/// Calculates orientation angle in degrees [-45, 45] of a 4-point polygon or contour.
/// Snaps angles < 1.5° or steep vertical angles to 0.0.
pub fn calculate_box_angle(pts: &[[f32; 2]]) -> f32 {
    if pts.len() < 3 {
        return 0.0;
    }

    let angle_deg = if pts.len() == 4 {
        let mut sorted_x = pts.to_vec();
        sorted_x.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));

        let (tl, bl) = if sorted_x[0][1] < sorted_x[1][1] {
            (sorted_x[0], sorted_x[1])
        } else {
            (sorted_x[1], sorted_x[0])
        };

        let (tr, br) = if sorted_x[2][1] < sorted_x[3][1] {
            (sorted_x[2], sorted_x[3])
        } else {
            (sorted_x[3], sorted_x[2])
        };

        let w_top = ((tr[0] - tl[0]).powi(2) + (tr[1] - tl[1]).powi(2)).sqrt();
        let w_bot = ((br[0] - bl[0]).powi(2) + (br[1] - bl[1]).powi(2)).sqrt();
        let h_left = ((bl[0] - tl[0]).powi(2) + (bl[1] - tl[1]).powi(2)).sqrt();
        let h_right = ((br[0] - tr[0]).powi(2) + (br[1] - tr[1]).powi(2)).sqrt();

        let mean_w = (w_top + w_bot) / 2.0;
        let mean_h = (h_left + h_right) / 2.0;

        if mean_h >= 1.25 * mean_w {
            // VERTICAL TEXT LINE: MEASURE TILT OF VERTICAL EDGES (TL -> BL, TR -> BR)
            let dx_v = (bl[0] - tl[0] + br[0] - tr[0]) / 2.0;
            let dy_v = (bl[1] - tl[1] + br[1] - tr[1]) / 2.0;
            if dy_v.abs() < 1e-4 {
                return 0.0;
            }
            // Deflection angle from pure vertical axis (dx / dy)
            let v_deg = (-dx_v).atan2(dy_v).to_degrees();
            if v_deg.abs() < 10.0 && mean_h <= 3.5 * mean_w {
                // Minor baseline/column dilation jitter on moderately tall bubbles
                0.0
            } else {
                v_deg
            }
        } else {
            // HORIZONTAL TEXT LINE: MEASURE TILT OF HORIZONTAL EDGES (TL -> TR, BL -> BR)
            let dx = (tr[0] - tl[0] + br[0] - bl[0]) / 2.0;
            let dy = (tr[1] - tl[1] + br[1] - bl[1]) / 2.0;

            if dx == 0.0 && dy == 0.0 {
                return 0.0;
            }

            let angle_rad = dy.atan2(dx);
            let mut deg = angle_rad.to_degrees();

            while deg > 90.0 {
                deg -= 180.0;
            }
            while deg < -90.0 {
                deg += 180.0;
            }

            let box_w = (tr[0] - tl[0] + br[0] - bl[0]) / 2.0;
            let box_h = (bl[1] - tl[1] + br[1] - tr[1]) / 2.0;
            if box_w <= 1.6 * 1.0_f32.max(box_h) && deg.abs() < 5.0 {
                return 0.0;
            }

            deg
        }
    } else {
        let (_box_pts, _sside) = get_mini_boxes(pts);
        calculate_box_angle(&_box_pts)
    };

    if angle_deg.abs() < 1.5 || angle_deg.abs() > 45.0 {
        0.0
    } else {
        (angle_deg * 100.0).round() / 100.0
    }
}

pub fn calculate_box_angle_i32(pts: &[[i32; 2]]) -> f32 {
    let f32_pts: Vec<[f32; 2]> = pts.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
    calculate_box_angle(&f32_pts)
}

/// 2D cross product of OA and OB vectors: (A.x - O.x)*(B.y - O.y) - (A.y - O.y)*(B.x - O.x)
fn cross_product_2d(o: [f32; 2], a: [f32; 2], b: [f32; 2]) -> f32 {
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/// Monotone Chain algorithm for 2D Convex Hull
pub fn convex_hull(pts: &[[f32; 2]]) -> Vec<[f32; 2]> {
    let mut points = pts.to_vec();
    if points.len() <= 3 {
        return points;
    }

    points.sort_by(|a, b| {
        a[0].total_cmp(&b[0])
            .then(a[1].total_cmp(&b[1]))
    });
    points.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-4 && (a[1] - b[1]).abs() < 1e-4);

    let n = points.len();
    if n <= 3 {
        return points;
    }

    let mut lower = Vec::with_capacity(n);
    for &p in &points {
        while lower.len() >= 2 && cross_product_2d(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0.0 {
            lower.pop();
        }
        lower.push(p);
    }

    let mut upper = Vec::with_capacity(n);
    for &p in points.iter().rev() {
        while upper.len() >= 2 && cross_product_2d(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0.0 {
            upper.pop();
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

/// Computes Minimum-Area Oriented Bounding Box via Rotating Calipers (cv2.minAreaRect port).
/// Returns 4 ordered vertices [TL, TR, BR, BL] and the min side length.
pub fn get_mini_boxes(contour: &[[f32; 2]]) -> (Vec<[f32; 2]>, f32) {
    let hull = convex_hull(contour);
    if hull.len() < 3 {
        let (x, y, w, h) = box_to_xywh_f32(contour);
        let poly = vec![
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ];
        return (poly, w.min(h));
    }

    let n = hull.len();
    let mut min_area = f32::INFINITY;
    let mut best_rect: Vec<[f32; 2]> = Vec::new();
    let mut min_side = 0.0_f32;

    for i in 0..n {
        let p1 = hull[i];
        let p2 = hull[(i + 1) % n];

        let edge = [p2[0] - p1[0], p2[1] - p1[1]];
        let edge_len = (edge[0] * edge[0] + edge[1] * edge[1]).sqrt();
        if edge_len < 1e-5 {
            continue;
        }

        // Unit vectors along and perpendicular to edge
        let u = [edge[0] / edge_len, edge[1] / edge_len];
        let v = [-u[1], u[0]];

        let mut min_u = f32::INFINITY;
        let mut max_u = -f32::INFINITY;
        let mut min_v = f32::INFINITY;
        let mut max_v = -f32::INFINITY;

        for &p in &hull {
            let dot_u = p[0] * u[0] + p[1] * u[1];
            let dot_v = p[0] * v[0] + p[1] * v[1];
            min_u = min_u.min(dot_u);
            max_u = max_u.max(dot_u);
            min_v = min_v.min(dot_v);
            max_v = max_v.max(dot_v);
        }

        let w = max_u - min_u;
        let h = max_v - min_v;
        let area = w * h;

        if area < min_area {
            min_area = area;
            min_side = w.min(h);

            // Reconstruct 4 vertices in standard space
            let c0 = [min_u * u[0] + min_v * v[0], min_u * u[1] + min_v * v[1]];
            let c1 = [max_u * u[0] + min_v * v[0], max_u * u[1] + min_v * v[1]];
            let c2 = [max_u * u[0] + max_v * v[0], max_u * u[1] + max_v * v[1]];
            let c3 = [min_u * u[0] + max_v * v[0], min_u * u[1] + max_v * v[1]];
            best_rect = vec![c0, c1, c2, c3];
        }
    }

    if best_rect.len() != 4 {
        let (x, y, w, h) = box_to_xywh_f32(contour);
        let poly = vec![
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ];
        return (poly, w.min(h));
    }

    // Standardize 4-point ordering: sort by x, then assign [TL, TR, BR, BL]
    let mut points = best_rect;
    points.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));

    let (i1, i4) = if points[1][1] > points[0][1] {
        (0, 1)
    } else {
        (1, 0)
    };

    let (i2, i3) = if points[3][1] > points[2][1] {
        (2, 3)
    } else {
        (3, 2)
    };

    let ordered = vec![points[i1], points[i2], points[i3], points[i4]];
    (ordered, min_side)
}

/// Polygon offset expansion (pyclipper unclip port).
/// Expands polygon vertices outward by distance = area * unclip_ratio / perimeter.
pub fn unclip_polygon(box_pts: &[[f32; 2]], unclip_ratio: f32) -> Option<Vec<[f32; 2]>> {
    if box_pts.len() < 3 {
        return None;
    }

    let n = box_pts.len();
    let mut signed_area = 0.0_f32;
    let mut perimeter = 0.0_f32;

    for i in 0..n {
        let p1 = box_pts[i];
        let p2 = box_pts[(i + 1) % n];
        signed_area += p1[0] * p2[1] - p2[0] * p1[1];
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        perimeter += (dx * dx + dy * dy).sqrt();
    }
    let area = signed_area.abs() / 2.0;

    if perimeter <= 1e-4 || area <= 1e-4 {
        return None;
    }

    let sign = if signed_area > 0.0 { 1.0_f32 } else { -1.0_f32 };
    let distance = area * unclip_ratio / perimeter;

    // Expand outward along vertex normals
    let mut expanded = Vec::with_capacity(n);
    for i in 0..n {
        let prev = box_pts[(i + n - 1) % n];
        let curr = box_pts[i];
        let next = box_pts[(i + 1) % n];

        let v1 = [curr[0] - prev[0], curr[1] - prev[1]];
        let len1 = (v1[0] * v1[0] + v1[1] * v1[1]).sqrt().max(1e-5);
        let n1 = [sign * v1[1] / len1, -sign * v1[0] / len1];

        let v2 = [next[0] - curr[0], next[1] - curr[1]];
        let len2 = (v2[0] * v2[0] + v2[1] * v2[1]).sqrt().max(1e-5);
        let n2 = [sign * v2[1] / len2, -sign * v2[0] / len2];

        let bisector = [n1[0] + n2[0], n1[1] + n2[1]];
        let blen = (bisector[0] * bisector[0] + bisector[1] * bisector[1]).sqrt().max(1e-5);
        let unit_b = [bisector[0] / blen, bisector[1] / blen];

        let cos_half = n1[0] * unit_b[0] + n1[1] * unit_b[1];
        let scale = if cos_half > 0.1 {
            (distance / cos_half).min(distance * 2.5)
        } else {
            distance
        };

        expanded.push([curr[0] + unit_b[0] * scale, curr[1] + unit_b[1] * scale]);
    }

    Some(expanded)
}

/// Fast polygon scanline rasterizer and mean probability calculator (box_score_fast port).
pub fn box_score_fast(bitmap: &[f32], map_w: usize, map_h: usize, contour: &[[f32; 2]]) -> f32 {
    if contour.is_empty() || bitmap.is_empty() {
        return 0.0;
    }

    let mut min_x = f32::INFINITY;
    let mut max_x = -f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_y = -f32::INFINITY;

    for p in contour {
        min_x = min_x.min(p[0]);
        max_x = max_x.max(p[0]);
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }

    let x0 = (min_x.floor() as isize).clamp(0, map_w as isize - 1) as usize;
    let x1 = (max_x.ceil() as isize).clamp(0, map_w as isize - 1) as usize;
    let y0 = (min_y.floor() as isize).clamp(0, map_h as isize - 1) as usize;
    let y1 = (max_y.ceil() as isize).clamp(0, map_h as isize - 1) as usize;

    let n = contour.len();
    let mut sum = 0.0_f32;
    let mut count = 0_usize;

    for y in y0..=y1 {
        let py = y as f32 + 0.5;
        let mut node_x = Vec::new();

        for i in 0..n {
            let p1 = contour[i];
            let p2 = contour[(i + 1) % n];

            if (p1[1] < py && p2[1] >= py) || (p2[1] < py && p1[1] >= py) {
                let x = p1[0] + (py - p1[1]) / (p2[1] - p1[1]) * (p2[0] - p1[0]);
                node_x.push(x);
            }
        }

        node_x.sort_by(|a, b| a.total_cmp(b));

        for chunk in node_x.chunks_exact(2) {
            let start_x = (chunk[0].floor() as isize).max(x0 as isize) as usize;
            let end_x = (chunk[1].ceil() as isize).min(x1 as isize) as usize;

            for x in start_x..=end_x {
                if x < map_w && y < map_h {
                    sum += bitmap[y * map_w + x];
                    count += 1;
                }
            }
        }
    }

    if count > 0 {
        sum / count as f32
    } else {
        0.0
    }
}

/// Border-following contour extractor (cv2.findContours RETR_LIST port) on binary map.
pub fn find_contours(binary_map: &[u8], width: usize, height: usize) -> Vec<Vec<[f32; 2]>> {
    let mut visited = vec![false; width * height];
    let mut contours = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            if binary_map[idx] > 0 && !visited[idx] {
                // Trace contour boundary using 8-connected BFS/DFS perimeter
                let mut perimeter = Vec::new();
                let mut queue = std::collections::VecDeque::new();
                queue.push_back((x, y));
                visited[idx] = true;

                while let Some((cx, cy)) = queue.pop_front() {
                    let mut is_boundary = false;
                    for (dx, dy) in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)] {
                        let nx = cx as isize + dx;
                        let ny = cy as isize + dy;
                        if nx < 0 || nx >= width as isize || ny < 0 || ny >= height as isize {
                            is_boundary = true;
                        } else {
                            let nidx = ny as usize * width + nx as usize;
                            if binary_map[nidx] == 0 {
                                is_boundary = true;
                            } else if !visited[nidx] {
                                visited[nidx] = true;
                                queue.push_back((nx as usize, ny as usize));
                            }
                        }
                    }
                    if is_boundary {
                        perimeter.push([cx as f32, cy as f32]);
                    }
                }

                if perimeter.len() >= 4 {
                    let hull = convex_hull(&perimeter);
                    if hull.len() >= 3 {
                        contours.push(hull);
                    }
                }
            }
        }
    }

    contours
}

/// Fills polygon onto a 1-channel u8 binary mask (cv2.fillPoly port).
pub fn fill_polygon(mask: &mut [u8], width: usize, height: usize, poly: &[[i32; 2]], val: u8) {
    if poly.len() < 3 || width == 0 || height == 0 {
        return;
    }

    let mut min_y = height as i32;
    let mut max_y = 0_i32;

    for p in poly {
        min_y = min_y.min(p[1]);
        max_y = max_y.max(p[1]);
    }

    let y_start = min_y.clamp(0, height as i32 - 1) as usize;
    let y_end = max_y.clamp(0, height as i32 - 1) as usize;
    let n = poly.len();

    for y in y_start..=y_end {
        let py = y as f32 + 0.5;
        let mut node_x = Vec::new();

        for i in 0..n {
            let p1 = [poly[i][0] as f32, poly[i][1] as f32];
            let p2 = [poly[(i + 1) % n][0] as f32, poly[(i + 1) % n][1] as f32];

            if (p1[1] < py && p2[1] >= py) || (p2[1] < py && p1[1] >= py) {
                let x = p1[0] + (py - p1[1]) / (p2[1] - p1[1]) * (p2[0] - p1[0]);
                node_x.push(x);
            }
        }

        node_x.sort_by(|a, b| a.total_cmp(b));

        for chunk in node_x.chunks_exact(2) {
            let start_x = (chunk[0].floor() as isize).clamp(0, width as isize - 1) as usize;
            let end_x = (chunk[1].ceil() as isize).clamp(0, width as isize - 1) as usize;

            for x in start_x..=end_x {
                mask[y * width + x] = val;
            }
        }
    }
}

/// Morphological dilation on a 1-channel u8 binary mask (cv2.dilate port).
pub fn dilate_mask(mask: &[u8], width: usize, height: usize, radius: i32) -> Vec<u8> {
    if radius <= 0 || mask.is_empty() {
        return mask.to_vec();
    }

    let mut dilated = mask.to_vec();
    let rad = radius as isize;

    for y in 0..height as isize {
        for x in 0..width as isize {
            if mask[(y as usize) * width + (x as usize)] > 0 {
                let y0 = (y - rad).max(0);
                let y1 = (y + rad).min(height as isize - 1);
                let x0 = (x - rad).max(0);
                let x1 = (x + rad).min(width as isize - 1);

                for ny in y0..=y1 {
                    let dy = ny - y;
                    for nx in x0..=x1 {
                        let dx = nx - x;
                        if dx * dx + dy * dy <= rad * rad {
                            dilated[(ny as usize) * width + (nx as usize)] = 255;
                        }
                    }
                }
            }
        }
    }

    dilated
}

/// ORDERS 4 CORNER POINTS INTO [TOP-LEFT, TOP-RIGHT, BOTTOM-RIGHT, BOTTOM-LEFT]
pub fn order_points_clockwise(pts: &[[f32; 2]]) -> [[f32; 2]; 4] {
    let mut sorted_x = pts.to_vec();
    sorted_x.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));

    let (tl, bl) = if sorted_x[0][1] < sorted_x[1][1] {
        (sorted_x[0], sorted_x[1])
    } else {
        (sorted_x[1], sorted_x[0])
    };

    let (tr, br) = if sorted_x[2][1] < sorted_x[3][1] {
        (sorted_x[2], sorted_x[3])
    } else {
        (sorted_x[3], sorted_x[2])
    };

    [tl, tr, br, bl]
}

/// RECTIFIES A ROTATED 4-POINT BOUNDING QUAD INTO AN UPRIGHT HORIZONTAL CROP USING BILINEAR INTERPOLATION
pub fn get_rotate_crop_image(img: &image::DynamicImage, pts: &[[i32; 2]]) -> Option<image::DynamicImage> {
    if pts.len() != 4 {
        return None;
    }

    let f32_pts: Vec<[f32; 2]> = pts.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
    let [tl, tr, br, bl] = order_points_clockwise(&f32_pts);

    let top_w = ((tr[0] - tl[0]).powi(2) + (tr[1] - tl[1]).powi(2)).sqrt();
    let bot_w = ((br[0] - bl[0]).powi(2) + (br[1] - bl[1]).powi(2)).sqrt();
    let left_h = ((bl[0] - tl[0]).powi(2) + (bl[1] - tl[1]).powi(2)).sqrt();
    let right_h = ((br[0] - tr[0]).powi(2) + (br[1] - tr[1]).powi(2)).sqrt();

    let crop_w = (top_w.max(bot_w).round() as u32).max(4);
    let crop_h = (left_h.max(right_h).round() as u32).max(4);

    let (img_w, img_h) = image::GenericImageView::dimensions(img);
    if img_w == 0 || img_h == 0 {
        return None;
    }

    let rgb = img.to_rgb8();
    let mut out = image::ImageBuffer::from_pixel(crop_w, crop_h, image::Rgb([255_u8, 255, 255]));

    let max_x_idx = (img_w - 1) as f32;
    let max_y_idx = (img_h - 1) as f32;

    for y in 0..crop_h {
        let v = (y as f32 + 0.5) / crop_h as f32;
        let left_x = tl[0] * (1.0 - v) + bl[0] * v;
        let left_y = tl[1] * (1.0 - v) + bl[1] * v;
        let right_x = tr[0] * (1.0 - v) + br[0] * v;
        let right_y = tr[1] * (1.0 - v) + br[1] * v;

        for x in 0..crop_w {
            let u = (x as f32 + 0.5) / crop_w as f32;
            let src_x = (left_x * (1.0 - u) + right_x * u).clamp(0.0, max_x_idx);
            let src_y = (left_y * (1.0 - u) + right_y * u).clamp(0.0, max_y_idx);

            let x0 = src_x.floor() as u32;
            let y0 = src_y.floor() as u32;
            let x1 = (x0 + 1).min(img_w - 1);
            let y1 = (y0 + 1).min(img_h - 1);

            let fx = src_x - x0 as f32;
            let fy = src_y - y0 as f32;

            let p00 = rgb.get_pixel(x0, y0);
            let p10 = rgb.get_pixel(x1, y0);
            let p01 = rgb.get_pixel(x0, y1);
            let p11 = rgb.get_pixel(x1, y1);

            let mut out_rgb = [0_u8; 3];
            for c in 0..3 {
                let top = (p00[c] as f32) * (1.0 - fx) + (p10[c] as f32) * fx;
                let bot = (p01[c] as f32) * (1.0 - fx) + (p11[c] as f32) * fx;
                let val = top * (1.0 - fy) + bot * fy;
                out_rgb[c] = val.round().clamp(0.0, 255.0) as u8;
            }

            out.put_pixel(x, y, image::Rgb(out_rgb));
        }
    }

    let dynamic_out = image::DynamicImage::ImageRgb8(out);
    if crop_h as f32 >= 1.5 * crop_w as f32 {
        Some(dynamic_out.rotate270())
    } else {
        Some(dynamic_out)
    }
}

