#pragma once

#include <string>
#include <unordered_map>
#include <vector>
#include <sstream>
#include <algorithm>
#include <cctype>

namespace Dyarte {
namespace Agent {

class JsonValue;

class JsonParser {
public:
    static bool Parse(const std::string& input, JsonValue& out);

private:
    static constexpr int MAX_PARSE_DEPTH = 32;

    static void SkipWhitespace(const std::string& s, size_t& idx) {
        while (idx < s.size() && (s[idx] == ' ' || s[idx] == '\t' || s[idx] == '\r' || s[idx] == '\n')) {
            idx++;
        }
    }

    static bool ParseValue(const std::string& s, size_t& idx, JsonValue& out, int depth = 0);
    static bool ParseString(const std::string& s, size_t& idx, std::string& out);
    static bool ParseObject(const std::string& s, size_t& idx, JsonValue& out, int depth = 0);
};

// Safe zero-dependency lightweight JSON reader & writer for the Agent protocol
class JsonValue {
public:
    enum class Type { Null, Bool, Number, String, Object };

    Type type = Type::Null;
    bool boolVal = false;
    double numVal = 0.0;
    std::string strVal;
    std::unordered_map<std::string, JsonValue> objVal;

    bool is_null() const { return type == Type::Null; }
    bool is_bool() const { return type == Type::Bool; }
    bool is_number() const { return type == Type::Number; }
    bool is_string() const { return type == Type::String; }
    bool is_object() const { return type == Type::Object; }

    bool get_bool(bool def = false) const { return is_bool() ? boolVal : def; }
    int get_int(int def = 0) const { return is_number() ? static_cast<int>(numVal) : def; }
    int64_t get_int64(int64_t def = 0) const { return is_number() ? static_cast<int64_t>(numVal) : def; }
    std::string get_string(const std::string& def = "") const { return is_string() ? strVal : def; }

    bool has_field(const std::string& key) const {
        if (!is_object()) return false;
        return objVal.find(key) != objVal.end();
    }

    JsonValue get(const std::string& key) const {
        if (!is_object()) return JsonValue();
        auto it = objVal.find(key);
        if (it != objVal.end()) {
            return it->second;
        }
        return JsonValue();
    }

    std::string get_field_string(const std::string& key, const std::string& def = "") const {
        return get(key).get_string(def);
    }

    int get_field_int(const std::string& key, int def = 0) const {
        return get(key).get_int(def);
    }

    int64_t get_field_int64(const std::string& key, int64_t def = 0) const {
        return get(key).get_int64(def);
    }

    bool get_field_bool(const std::string& key, bool def = false) const {
        return get(key).get_bool(def);
    }

    JsonValue get_field(const std::string& key) const {
        return get(key);
    }

    std::string to_json() const {
        if (is_null()) return "null";
        if (is_bool()) return boolVal ? "true" : "false";
        if (is_number()) {
            if (numVal == static_cast<int64_t>(numVal)) {
                return std::to_string(static_cast<int64_t>(numVal));
            }
            return std::to_string(numVal);
        }
        if (is_string()) {
            std::stringstream ss;
            ss << "\"";
            for (char c : strVal) {
                if (c == '"') ss << "\\\"";
                else if (c == '\\') ss << "\\\\";
                else if (c == '\n') ss << "\\n";
                else if (c == '\r') ss << "\\r";
                else if (c == '\t') ss << "\\t";
                else ss << c;
            }
            ss << "\"";
            return ss.str();
        }
        if (is_object()) {
            std::stringstream ss;
            ss << "{";
            bool first = true;
            for (const auto& kv : objVal) {
                if (!first) ss << ",";
                first = false;
                ss << "\"" << kv.first << "\":" << kv.second.to_json();
            }
            ss << "}";
            return ss.str();
        }
        return "null";
    }

    static JsonValue parse(const std::string& input) {
        JsonValue val;
        JsonParser::Parse(input, val);
        return val;
    }
};

inline bool JsonParser::Parse(const std::string& input, JsonValue& out) {
    if (input.empty() || input.size() > 1024 * 1024) return false; // reject payloads > 1MB
    size_t idx = 0;
    SkipWhitespace(input, idx);
    if (idx >= input.size()) return false;
    bool ok = ParseValue(input, idx, out, 0);
    if (!ok) return false;
    SkipWhitespace(input, idx);
    // Ensure document is completely consumed (reject trailing junk)
    if (idx != input.size()) return false;
    return true;
}

inline bool JsonParser::ParseValue(const std::string& s, size_t& idx, JsonValue& out, int depth) {
    if (depth > MAX_PARSE_DEPTH) return false;
    SkipWhitespace(s, idx);
    if (idx >= s.size()) return false;

    char c = s[idx];
    if (c == '{') {
        return ParseObject(s, idx, out, depth + 1);
    } else if (c == '"') {
        std::string str;
        if (ParseString(s, idx, str)) {
            out.type = JsonValue::Type::String;
            out.strVal = str;
            return true;
        }
        return false;
    } else if (c == 't' || c == 'f') {
        if (s.compare(idx, 4, "true") == 0) {
            out.type = JsonValue::Type::Bool;
            out.boolVal = true;
            idx += 4;
            return true;
        } else if (s.compare(idx, 5, "false") == 0) {
            out.type = JsonValue::Type::Bool;
            out.boolVal = false;
            idx += 5;
            return true;
        }
        return false;
    } else if (c == 'n' && s.compare(idx, 4, "null") == 0) {
        out.type = JsonValue::Type::Null;
        idx += 4;
        return true;
    } else if (c == '-' || (c >= '0' && c <= '9')) {
        size_t start = idx;
        if (s[idx] == '-') idx++;
        while (idx < s.size() && ((s[idx] >= '0' && s[idx] <= '9') || s[idx] == '.' || s[idx] == 'e' || s[idx] == 'E' || s[idx] == '+' || s[idx] == '-')) {
            idx++;
        }
        std::string numStr = s.substr(start, idx - start);
        try {
            out.type = JsonValue::Type::Number;
            out.numVal = std::stod(numStr);
            return true;
        } catch (...) {
            return false;
        }
    }
    return false;
}

inline bool JsonParser::ParseString(const std::string& s, size_t& idx, std::string& out) {
    if (idx >= s.size() || s[idx] != '"') return false;
    idx++; // skip open quote
    out.clear();

    while (idx < s.size()) {
        char c = s[idx++];
        if (c == '"') {
            return true;
        }
        if (c == '\\') {
            if (idx >= s.size()) return false;
            char esc = s[idx++];
            if (esc == '"' || esc == '\\' || esc == '/') out.push_back(esc);
            else if (esc == 'b') out.push_back('\b');
            else if (esc == 'f') out.push_back('\f');
            else if (esc == 'n') out.push_back('\n');
            else if (esc == 'r') out.push_back('\r');
            else if (esc == 't') out.push_back('\t');
            else out.push_back(esc);
        } else {
            out.push_back(c);
        }
    }
    return false;
}

inline bool JsonParser::ParseObject(const std::string& s, size_t& idx, JsonValue& out, int depth) {
    if (depth > MAX_PARSE_DEPTH) return false;
    if (idx >= s.size() || s[idx] != '{') return false;
    idx++; // skip '{'
    out.type = JsonValue::Type::Object;
    out.objVal.clear();

    SkipWhitespace(s, idx);
    if (idx < s.size() && s[idx] == '}') {
        idx++;
        return true;
    }

    while (idx < s.size()) {
        SkipWhitespace(s, idx);
        if (idx >= s.size() || s[idx] != '"') return false;

        std::string key;
        if (!ParseString(s, idx, key)) return false;

        SkipWhitespace(s, idx);
        if (idx >= s.size() || s[idx] != ':') return false;
        idx++; // skip ':'

        JsonValue val;
        if (!ParseValue(s, idx, val, depth + 1)) return false;

        out.objVal[key] = val;

        SkipWhitespace(s, idx);
        if (idx < s.size() && s[idx] == ',') {
            idx++;
            continue;
        } else if (idx < s.size() && s[idx] == '}') {
            idx++;
            return true;
        } else {
            return false;
        }
    }
    return false;
}

} // namespace Agent
} // namespace Dyarte
